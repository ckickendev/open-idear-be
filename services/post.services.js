const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { Post, Like, Series, Category, Course } = require("../models");
const { NotFoundException, ServerException } = require("../exceptions");
const { default: slugify } = require("slugify");
const { ContentStructureService } = require("../ai/content/contentStructure.service");
const { memoryCache } = require("../utils/cache");

class PostService extends Service {
    async getAll(status, page = 1, limit = 20) {
        const query = status === 'trash' ? { del_flag: 1 } : { del_flag: 0 };
        const posts = await Post.find(query)
            .populate('category', "name")
            .populate('author', 'username email name')
            .populate('image', 'url description')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();
        return posts;
    }

    async getLastestPostByUser(userId) {
        const posts = await Post.find({ userId }).sort({ createdAt: -1 }).limit(5);
        return posts;
    }

    async getPostByUser(userId) {
        if (!userId) {
            throw new NotFoundException("User not found");
        }
        try {
            const posts = await Post.find({ author: userId })
                .sort({ createdAt: -1 })
                .populate('category', 'name slug')
                .populate('tags')
                .populate('author', 'username email avatar name')
                .populate('image', 'url description');

            const returnPosts = posts.map(post => {
                return {
                    _id: post._id,
                    title: post.title,
                    description: post.description,
                    image: post.image,
                    slug: post.slug,
                    content: post.content,
                    text: post.text,
                    author: post.author,
                    category: post.category ? post.category : { name: "Uncategorized", slug: "uncategorized" },
                    tags: post.tags.map(tag => tag.name),
                    published: post.published,
                    views: post.views,
                    likes: post.likes,
                    marked: post.marked,
                    readtime: post.readtime,
                    createdAt: post.createdAt,
                    updatedAt: post.updatedAt,
                    contentVersion: post.contentVersion || "html-v1",
                    blocks: post.blocks || undefined,
                    hero: post.hero || undefined,
                    aiContext: post.aiContext || undefined,
                    seo: post.seo || undefined,
                }
            });

            return returnPosts;
        } catch (error) {
            console.log('error', error);
            throw new ServerException("error");
        }

    }

    async getSeriesByUser(id) {
        if (!id) {
            throw new NotFoundException("User not found");
        }
        try {
            const series = await Series.find({ user: id })
                .sort({ createdAt: -1 })
                .populate('user', 'username name email avatar')
                .populate('posts', 'title slug')
                .populate('image', 'url description');

            return series;
        } catch (error) {
            console.log('error', error);
            throw new ServerException("error");
        }

    }

    async generateUniqueSlug(title, excludePostId = null) {
        const rawTitle = title && typeof title === "string" && title.trim() ? title.trim() : "untitled";
        const rawSlug = (slugify ? slugify(rawTitle, { lower: true, strict: true }) : rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")) || "post";
        const baseSlug = rawSlug.replace(/^-+|-+$/g, "") || `post-${Date.now()}`;
        let uniqueSlug = baseSlug;

        const query = { slug: uniqueSlug };
        if (excludePostId) {
            query._id = { $ne: excludePostId };
        }

        const count = await Post.countDocuments(query);
        if (count > 0) {
            uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;
            const secondQuery = { slug: uniqueSlug };
            if (excludePostId) {
                secondQuery._id = { $ne: excludePostId };
            }
            const secondCount = await Post.countDocuments(secondQuery);
            if (secondCount > 0) {
                uniqueSlug = `${baseSlug}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
            }
        }

        return uniqueSlug;
    }

    async addPost(post) {
        const title = post.title?.trim() || "Untitled";
        const slug = await this.generateUniqueSlug(title);
        const readPost = post.text ? post.text.split(" ").length / 225 : 0;

        let contentVersion = post.contentVersion || "html-v1";
        let blocks = post.blocks || undefined;

        // If blocks are provided or if contentVersion is "blocks-v1" or if markdown/aiContext is provided
        if (!blocks && (post.contentVersion === "blocks-v1" || post.markdown || post.aiContext)) {
          const markdownSource = post.markdown || post.content || "";
          if (markdownSource.trim()) {
            const struct = ContentStructureService.buildArticleStructure({
              markdown: markdownSource,
              growthResults: post.aiContext?.growthResults || null,
            });
            blocks = struct.blocks;
            contentVersion = "blocks-v1";
          }
        } else if (blocks && Array.isArray(blocks) && blocks.length > 0) {
          contentVersion = "blocks-v1";
        }

        const newPost = new Post({
            _id: new mongoose.Types.ObjectId(),
            title: post.title,
            content: post.content,
            text: post.text,
            author: post.author,
            category: post.category,
            tags: post.tags,
            slug,
            published: false,
            views: 0,
            likes: [],
            marked: [],
            comments: [],
            isFreePreview: post.isFreePreview || false,
            lessonType: post.lessonType || "text",
            mediaContent: post.mediaContent || null,
            del_flag: 0,
            readtime: Math.ceil(readPost),
            contentVersion,
            blocks,
            hero: post.hero || undefined,
            aiContext: post.aiContext || undefined,
            seo: post.seo || undefined,
        });
        const returnPost = await Post.create(newPost);
        return returnPost;
    }

    async getPostById(postId) {
        const post = await Post.findById(postId)
            .populate('category', "name slug")
            .populate('author', 'username email avatar')
            .populate('tags', 'name')
            .populate('image', 'url description')
            .populate('mediaContent', 'url type description');
        if (!post) {
            return null;
        }
        return post;
    }

    async getPostBySlug(slug) {
        const post = await Post.findOne({ slug: slug, published: true, del_flag: 0 })
            .populate('category', "name slug")
            .populate('author', 'username email avatar')
            .populate('tags', 'name')
            .populate('image', 'url description')
            .populate('mediaContent', 'url type description');

        if (!post) {
            return null;
        }
        return post;
    }

    async getRecentlyData() {
        const posts = await Post.find({
            del_flag: 0,
            published: true
        })
            .sort({ createdAt: -1 })
            .limit(7)
            .populate('category', "name slug")
            .populate('author', 'username email avatar')
            .populate('tags', 'name')
            .populate('image', 'url description');

        const categories = posts.reduce((acc, post) => {
            const category = post.category;
            if (category && !acc.find(cat => cat._id.toString() === category._id.toString())) {
                acc.push(category);
            }
            return acc;
        }, []);

        return { categories, posts };
    }

    async updatePost(postId, post) {
        const readPost = post.text ? post.text.split(" ").length / 225 : 0;
        const existingPost = await Post.findById(postId);
        if (!existingPost) {
            throw new NotFoundException("Post not found");
        }

        let slug = existingPost.slug;
        if (post.title && (post.title.trim() !== existingPost.title || !slug)) {
            slug = await this.generateUniqueSlug(post.title.trim(), postId);
        }

        const updateObj = {
            title: post.title,
            content: post.content,
            text: post.text,
            readtime: Math.ceil(readPost),
            slug,
        };

        if (post.contentVersion) updateObj.contentVersion = post.contentVersion;
        if (post.blocks !== undefined) updateObj.blocks = post.blocks;
        if (post.hero !== undefined) updateObj.hero = post.hero;
        if (post.aiContext !== undefined) updateObj.aiContext = post.aiContext;
        if (post.seo !== undefined) updateObj.seo = post.seo;

        // Auto build blocks if requested or if markdown/aiContext is supplied and blocks missing
        if (!updateObj.blocks && (post.contentVersion === "blocks-v1" || post.markdown || (post.aiContext && post.contentVersion === "blocks-v1"))) {
          const markdownSource = post.markdown || post.content || "";
          if (markdownSource.trim()) {
            const struct = ContentStructureService.buildArticleStructure({
              markdown: markdownSource,
              growthResults: post.aiContext?.growthResults || null,
            });
            updateObj.blocks = struct.blocks;
            updateObj.contentVersion = "blocks-v1";
          }
        }

        const updatedPost = await Post.findByIdAndUpdate(postId, updateObj, { new: true });
        memoryCache.invalidate('hot_posts_');
        return updatedPost;
    }


    async updateStatusPost(postId, published) {
        await Post.findByIdAndUpdate(postId, {
            published: published
        }, { new: true });
        memoryCache.invalidate('hot_posts_');
    }

    async getPostLikeById(userId) {
        const likePost = await Like.find({ user: userId }).populate("post");
        return likePost;
    }

    async getPostMarkedById(userId) {
        const markedPost = await Post.find({ marked: { $in: [userId] }, published: true })
            .sort({ createdAt: -1 })
            .populate('category', "name slug")
            .populate('author', 'username email avatar')
            .populate('tags', 'name')
            .populate('image', 'url description');
        return markedPost;
    }

    async publicPost(postId, publicInfo) {
        try {
            if (publicInfo.series) {
                const series = await Series.findById(publicInfo.series);
                if (series) {
                    console.log('series', series);

                    await Series.findByIdAndUpdate(series, {
                        $push: { posts: postId }
                    });
                } else {
                    throw new NotFoundException("Series not found");
                }
            }

            if (publicInfo.category) {
                const category = await Category.findById(publicInfo.category);
                if (!category) {
                    throw new NotFoundException("Category not found");
                }
            }
            console.log('publicInfo', publicInfo);
            const updatedPost = await Post.findByIdAndUpdate(postId, {
                description: publicInfo.description,
                image: publicInfo.image,
                category: publicInfo.category,
                published: true,
            }, { new: true });
            memoryCache.invalidate('hot_posts_');
            return updatedPost;
        } catch (error) {
            console.error('Error publishing post:', error);
            throw new ServerException("Error publishing post");
        }
    }

    async markedPost(postId, userId) {

        const post = await Post.findById(postId);
        if (!post) {
            throw new NotFoundException("Post not found");
        }
        if (post.published === false) {
            throw new NotFoundException("Post not published");
        }
        if (post.marked.includes(userId)) {
            post.marked.pull(userId);
        } else {
            post.marked.push(userId);
        }
        await post.save();
        return post.marked.includes(userId);

    }

    calculateHotScore(post) {
        if (!post) return 0;
        const now = new Date();
        const createdAt = post.createdAt ? new Date(post.createdAt) : now;
        const postAge = Math.max(0, (now - createdAt) / (1000 * 60 * 60)); // age in hours

        const likesCount = Array.isArray(post.likes) ? post.likes.length : (typeof post.likes === 'number' ? post.likes : 0);
        const commentsCount = Array.isArray(post.comments) ? post.comments.length : (typeof post.comments === 'number' ? post.comments : 0);
        const views = typeof post.views === 'number' ? post.views : 0;

        // Hot score formula with gravity decay
        const score = (likesCount * 3 + commentsCount * 2.5 + views * 0.1) / Math.pow(postAge + 2, 0.8);
        return Math.round(score * 10000) / 10000;
    };

    /**
     * Optimized Hot Posts query using MongoDB Aggregation Pipeline, Late Lookup,
     * Field Projection, Smart Fallback window, and In-Memory TTL Caching.
     */
    async fetchHotPosts({ period = 'week', limit = 10, page = 1, fallbackIfFew = true } = {}) {
        try {
            const limitNum = Math.max(1, parseInt(limit) || 10);
            const pageNum = Math.max(1, parseInt(page) || 1);
            const cacheKey = `hot_posts_${period}_${limitNum}_${pageNum}`;

            const cached = memoryCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            const now = new Date();
            let startDate;
            if (period === 'today' || period === 'day') {
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            } else if (period === 'month') {
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 30);
            } else { // default: 'week'
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 7);
            }

            const buildPipeline = (fromStartDate) => {
                const skip = (pageNum - 1) * limitNum;
                return [
                    {
                        $match: {
                            published: true,
                            del_flag: 0,
                            createdAt: { $gte: fromStartDate, $lte: now }
                        }
                    },
                    {
                        $addFields: {
                            likesCount: { $size: { $ifNull: ['$likes', []] } },
                            commentsCount: { $size: { $ifNull: ['$comments', []] } },
                            viewsCount: { $ifNull: ['$views', 0] },
                            ageInHours: {
                                $max: [
                                    0,
                                    {
                                        $divide: [
                                            { $subtract: [now, '$createdAt'] },
                                            3600000 // 1000 * 60 * 60
                                        ]
                                    }
                                ]
                            },
                            calculatedReadtime: {
                                $cond: [
                                    { $gt: [{ $ifNull: ['$readtime', 0] }, 0] },
                                    '$readtime',
                                    {
                                        $max: [
                                            1,
                                            {
                                                $ceil: {
                                                    $divide: [
                                                        { $strLenCP: { $ifNull: ['$text', ''] } },
                                                        1000
                                                    ]
                                                }
                                            }
                                        ]
                                    }
                                ]
                            }
                        }
                    },
                    {
                        $addFields: {
                            hotScore: {
                                $round: [
                                    {
                                        $divide: [
                                            {
                                                $add: [
                                                    { $multiply: ['$likesCount', 3] },
                                                    { $multiply: ['$commentsCount', 2.5] },
                                                    { $multiply: ['$viewsCount', 0.1] }
                                                ]
                                            },
                                            { $pow: [{ $add: ['$ageInHours', 2] }, 0.8] }
                                        ]
                                    },
                                    4
                                ]
                            }
                        }
                    },
                    {
                        $sort: {
                            hotScore: -1,
                            createdAt: -1
                        }
                    },
                    {
                        $facet: {
                            metadata: [{ $count: 'total' }],
                            items: [
                                { $skip: skip },
                                { $limit: limitNum },
                                {
                                    $lookup: {
                                        from: 'users',
                                        localField: 'author',
                                        foreignField: '_id',
                                        as: 'author',
                                        pipeline: [{ $project: { name: 1, username: 1, avatar: 1 } }]
                                    }
                                },
                                {
                                    $lookup: {
                                        from: 'categories',
                                        localField: 'category',
                                        foreignField: '_id',
                                        as: 'category',
                                        pipeline: [{ $project: { name: 1, slug: 1 } }]
                                    }
                                },
                                {
                                    $lookup: {
                                        from: 'tags',
                                        localField: 'tags',
                                        foreignField: '_id',
                                        as: 'tags',
                                        pipeline: [{ $project: { name: 1, slug: 1 } }]
                                    }
                                },
                                {
                                    $lookup: {
                                        from: 'media',
                                        localField: 'image',
                                        foreignField: '_id',
                                        as: 'image',
                                        pipeline: [{ $project: { url: 1, description: 1 } }]
                                    }
                                },
                                {
                                    $unwind: { path: '$author', preserveNullAndEmptyArrays: true }
                                },
                                {
                                    $unwind: { path: '$category', preserveNullAndEmptyArrays: true }
                                },
                                {
                                    $unwind: { path: '$image', preserveNullAndEmptyArrays: true }
                                },
                                {
                                    $project: {
                                        _id: 1,
                                        title: 1,
                                        slug: 1,
                                        description: 1,
                                        readtime: '$calculatedReadtime',
                                        text: {
                                            $ifNull: [
                                                '$description',
                                                { $substrCP: [{ $ifNull: ['$text', ''] }, 0, 250] }
                                            ]
                                        },
                                        published: 1,
                                        views: 1,
                                        likes: 1,
                                        comments: 1,
                                        author: 1,
                                        category: 1,
                                        tags: 1,
                                        image: 1,
                                        hotScore: 1,
                                        createdAt: 1,
                                        updatedAt: 1
                                    }
                                }
                            ]
                        }
                    }
                ];
            };

            let [aggregateResult] = await Post.aggregate(buildPipeline(startDate));
            let total = aggregateResult?.metadata[0]?.total || 0;
            let posts = aggregateResult?.items || [];

            // Fallback: If 'week' window has fewer than limitNum posts, expand to 30 days
            if (fallbackIfFew && period === 'week' && posts.length < limitNum) {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                const [fallbackResult] = await Post.aggregate(buildPipeline(thirtyDaysAgo));
                const fallbackTotal = fallbackResult?.metadata[0]?.total || 0;
                const fallbackPosts = fallbackResult?.items || [];
                if (fallbackPosts.length > posts.length) {
                    posts = fallbackPosts;
                    total = fallbackTotal;
                }
            }

            const totalPages = Math.ceil(total / limitNum) || 1;
            const result = {
                posts,
                totalPosts: total,
                totalPages,
                currentPage: pageNum,
                hasNext: pageNum < totalPages,
                hasPrev: pageNum > 1,
            };

            // Cache for 3 minutes
            memoryCache.set(cacheKey, result, 180000);
            return result;
        } catch (error) {
            console.error(`Error fetching hot posts (${period}):`, error);
            throw new ServerException(error.message || 'Error fetching hot posts');
        }
    }

    async getHotPostsToday(limit, page) {
        return this.fetchHotPosts({ period: 'today', limit, page, fallbackIfFew: false });
    }

    async getHotPostsThisWeek(limit, page) {
        return this.fetchHotPosts({ period: 'week', limit, page, fallbackIfFew: true });
    }

    async getHotPostsAggregation(req, res) {
        try {
            const { period = 'week', limit = 10, page = 1 } = req.query;
            const result = await this.fetchHotPosts({ period, limit, page });
            return res.json({
                success: true,
                data: result.posts,
                pagination: {
                    currentPage: result.currentPage,
                    totalPosts: result.totalPosts,
                    totalPages: result.totalPages,
                    hasNext: result.hasNext,
                    hasPrev: result.hasPrev
                }
            });
        } catch (error) {
            console.error('Error in getHotPostsAggregation:', error);
            return res.status(500).json({
                success: false,
                message: 'Error fetching hot posts',
                error: error.message
            });
        }
    };

    getRecentlyDataByFeatures = async (features) => {
        try {
            if (features === 'all' || !features) {
                const posts = await Post.find({ del_flag: 0, published: true })
                    .sort({ createdAt: -1 })
                    .limit(7)
                    .populate('category', "name slug")
                    .populate('author', 'username email avatar')
                    .populate('tags', 'name')
                    .populate('image', 'url description');
                return { posts };
            }
            const category = await Category.findOne({ slug: features });
            const posts = await Post.find({ del_flag: 0, published: true, category: category._id })
                .sort({ createdAt: -1 })
                .limit(7)
                .populate('category', "name slug")
                .populate('author', 'username email avatar')
                .populate('tags', 'name')
                .populate('image', 'url description');


            return { posts };
        } catch (error) {
            console.log('error', error);
            throw new ServerException("error");
        }
    }

    getAllPosts = async (limit, page) => {
        try {

            const posts = await Post.find({ del_flag: 0, published: true })
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(parseInt(limit))
                .populate('category', "name slug")
                .populate('author', 'username email avatar name')
                .populate('tags', 'name')
                .populate('image', 'url description');

            const query = { del_flag: 0, published: true };

            const totalPosts = await Post.countDocuments(query);

            return {
                posts,
                countData: totalPosts
            };
        } catch (error) {
            console.log('error', error);
            throw new ServerException("error");
        }
    };

    getAllPostLikeByUser = async (userId, page) => {
        try {

            const likePosts = await Post.find({ likes: { $in: [userId] }, del_flag: 0, published: true })
                .sort({ createdAt: -1 })
                .skip((page - 1) * 10)
                .limit(10)
                .populate('category', "name slug")
                .populate('author', 'username email avatar name')
                .populate('tags', 'name')
                .populate('image', 'url description');

            return {
                likePosts,
            };
        } catch (error) {
            console.log('error', error);
            throw new ServerException("error");
        }
    };

    getTop10IdeasOfMonth = async () => {
        try {
            const now = new Date();

            // Start of current calendar month
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            const buildPipeline = (startDate) => [
                {
                    $match: {
                        published: true,
                        del_flag: 0,
                        createdAt: { $gte: startDate, $lte: now }
                    }
                },
                {
                    $addFields: {
                        likesCount: { $size: '$likes' },
                        commentsCount: { $size: '$comments' },
                        engagementScore: {
                            $add: [
                                { $multiply: [{ $size: '$likes' }, 3] },
                                { $multiply: [{ $size: '$comments' }, 2] },
                                { $multiply: ['$views', 0.1] }
                            ]
                        }
                    }
                },
                { $sort: { engagementScore: -1 } },
                { $limit: 10 },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'author',
                        foreignField: '_id',
                        as: 'author',
                        pipeline: [{ $project: { name: 1, username: 1, avatar: 1 } }]
                    }
                },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'category',
                        foreignField: '_id',
                        as: 'category',
                        pipeline: [{ $project: { name: 1, slug: 1 } }]
                    }
                },
                {
                    $lookup: {
                        from: 'tags',
                        localField: 'tags',
                        foreignField: '_id',
                        as: 'tags',
                        pipeline: [{ $project: { name: 1, slug: 1 } }]
                    }
                },
                {
                    $lookup: {
                        from: 'media',
                        localField: 'image',
                        foreignField: '_id',
                        as: 'image',
                        pipeline: [{ $project: { url: 1, description: 1 } }]
                    }
                },
                {
                    $unwind: { path: '$author', preserveNullAndEmptyArrays: true }
                },
                {
                    $unwind: { path: '$category', preserveNullAndEmptyArrays: true }
                },
                {
                    $unwind: { path: '$image', preserveNullAndEmptyArrays: true }
                }
            ];

            // Try current month first
            let posts = await Post.aggregate(buildPipeline(startOfMonth));

            // Fallback: rolling 30-day window if current month has < 10 results
            if (posts.length < 10) {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                posts = await Post.aggregate(buildPipeline(thirtyDaysAgo));
            }

            // Calculate max score for relative progress bars
            const maxScore = posts.length > 0 ? posts[0].engagementScore : 1;

            return {
                posts: posts.map((p, idx) => ({
                    ...p,
                    rank: idx + 1,
                    relativeScore: maxScore > 0 ? Math.round((p.engagementScore / maxScore) * 100) : 0,
                })),
                period: {
                    month: now.getMonth() + 1,
                    year: now.getFullYear(),
                    label: now.toLocaleString('en-US', { month: 'long', year: 'numeric' })
                }
            };
        } catch (error) {
            console.error('Error fetching top10 ideas:', error);
            throw new ServerException('Error fetching top 10 ideas of the month');
        }
    };

    // Aggregate all discovery sidebar data in one call
    getDiscoverySidebar = async () => {
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const [trending, latestPosts, popularSeries, featuredCourses] = await Promise.all([
                // 🔥 Trending: hottest posts from last 7 days, sorted by likes+comments
                Post.find({
                    published: true,
                    del_flag: 0,
                    createdAt: { $gte: sevenDaysAgo }
                })
                    .sort({ likes: -1, createdAt: -1 })
                    .limit(5)
                    .populate('author', 'name username avatar')
                    .populate('image', 'url')
                    .select('title slug author image readtime createdAt')
                    .lean(),

                // 📚 Latest Posts: most recently published
                Post.find({ published: true, del_flag: 0 })
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .populate('author', 'name username avatar')
                    .populate('image', 'url')
                    .select('title slug author image readtime createdAt')
                    .lean(),

                // 🏆 Popular Series: hot series
                Series.find({ del_flag: 0 })
                    .sort({ updatedAt: -1 })
                    .limit(4)
                    .populate('user', 'name username avatar')
                    .populate('image', 'url')
                    .select('title slug user image description')
                    .lean(),

                // 🎓 Courses: most recent published courses
                Course.find({ del_flag: 0 })
                    .sort({ createdAt: -1 })
                    .limit(4)
                    .populate('instructor', 'name username avatar')
                    .populate('thumbnail', 'url')
                    .select('title slug instructor thumbnail price averageRating ratingCount description')
                    .lean(),
            ]);

            return { trending, latestPosts, popularSeries, featuredCourses };
        } catch (error) {
            console.error('Error fetching discovery sidebar:', error);
            throw new ServerException('Error fetching discovery sidebar data');
        }
    };

    deletePost = async (postId) => {
        const post = await Post.findByIdAndUpdate(postId, { del_flag: 1 }, { new: true });
        if (!post) throw new NotFoundException("Post not found");
        memoryCache.invalidate('hot_posts_');
        return { success: true };
    };

    restorePost = async (postId) => {
        const post = await Post.findByIdAndUpdate(postId, { del_flag: 0 }, { new: true });
        if (!post) throw new NotFoundException("Post not found");
        memoryCache.invalidate('hot_posts_');
        return { success: true };
    };
};

module.exports = new PostService();
