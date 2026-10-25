const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { Post, Like, Series, Category, Course, PostTranslation, Comment, ArticleVersion, CollectionItem } = require("../models");
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

    async getPostByUser(userId, locale = "en") {
        if (!userId) {
            throw new NotFoundException("User not found");
        }
        try {
            const validLocale = ["en", "vi"].includes(locale) ? locale : "en";
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

            return await this.overlayTranslations(returnPosts, validLocale);
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

    async generateUniqueSlug(title, excludePostId = null, locale = "en") {
        const validLocale = ["en", "vi"].includes(locale) ? locale : "en";
        const rawTitle = title && typeof title === "string" && title.trim() ? title.trim() : "untitled";
        const rawSlug = (slugify ? slugify(rawTitle, { lower: true, strict: true, locale: validLocale === "vi" ? "vi" : undefined }) : rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")) || "post";
        const baseSlug = rawSlug.replace(/^-+|-+$/g, "") || `post-${Date.now()}`;
        let uniqueSlug = baseSlug;

        const checkExists = async (candidate) => {
            if (mongoose.connection.readyState !== 1) {
                return false;
            }
            // Check translation collection for current locale
            const transQuery = { locale: validLocale, slug: candidate };
            if (excludePostId) {
                transQuery.postId = { $ne: excludePostId };
            }
            const transCount = await PostTranslation.countDocuments(transQuery);
            if (transCount > 0) return true;

            // Also check legacy Post collection to prevent collisions with unmigrated records
            const postQuery = { slug: candidate };
            if (excludePostId) {
                postQuery._id = { $ne: excludePostId };
            }
            const postCount = await Post.countDocuments(postQuery);
            return postCount > 0;
        };

        if (await checkExists(uniqueSlug)) {
            uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;
            if (await checkExists(uniqueSlug)) {
                uniqueSlug = `${baseSlug}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
            }
        }

        return uniqueSlug;
    }

    async addPost(post, requestedLocale = "en") {
        const validLocale = ["en", "vi"].includes(requestedLocale) ? requestedLocale : "en";
        const title = post.title?.trim() || "Untitled";
        const slug = await this.generateUniqueSlug(title, null, validLocale);
        const readPost = post.text ? post.text.split(" ").length / 225 : 0;
        const readtime = Math.ceil(readPost);

        let contentVersion = post.contentVersion || "html-v1";
        let blocks = post.blocks || undefined;

        // Auto build blocks if requested or if markdown/aiContext is provided
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

        const postId = new mongoose.Types.ObjectId();

        // 1. Create parent Post document (shared container for taxonomy, metrics, author)
        const newPost = new Post({
            _id: postId,
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
            readtime,
            contentVersion,
            blocks,
            hero: post.hero || undefined,
            aiContext: post.aiContext || undefined,
            seo: post.seo || undefined,
            defaultLocale: validLocale,
            availableLocales: [validLocale],
        });
        const returnPost = await Post.create(newPost);

        // 2. Create authoritative initial PostTranslation record
        await PostTranslation.create({
            _id: new mongoose.Types.ObjectId(),
            postId: newPost._id,
            locale: validLocale,
            title,
            slug,
            description: (post.description || "").trim(),
            content: post.content,
            text: post.text,
            contentVersion,
            blocks,
            hero: post.hero || undefined,
            aiContext: post.aiContext || undefined,
            seo: post.seo || undefined,
            published: false,
            publishedAt: null,
            readtime,
        });

        // Invalidate partitioned caches
        memoryCache.invalidate('hot_posts_');
        memoryCache.invalidate(`hot_posts_${validLocale}`);

        return returnPost;
    }

    async getPostById(postId, requestedLocale = null) {
        const post = await Post.findById(postId)
            .populate('category', "name slug")
            .populate('author', 'username email avatar')
            .populate('tags', 'name')
            .populate('image', 'url description')
            .populate('mediaContent', 'url type description')
            .populate('currentVersionId', 'version changelog source createdAt markdown html blocks');
        if (!post) {
            return null;
        }

        const postObj = post.toObject ? post.toObject() : { ...post };

        if (postObj.currentVersionId && typeof postObj.currentVersionId === "object") {
            if (!postObj.markdown && postObj.currentVersionId.markdown) {
                postObj.markdown = postObj.currentVersionId.markdown;
            }
            if ((!postObj.blocks || postObj.blocks.length === 0) && postObj.currentVersionId.blocks?.length > 0) {
                postObj.blocks = postObj.currentVersionId.blocks;
            }
        }

        // Look for matching translation in PostTranslation
        let translation = null;
        if (requestedLocale && ["en", "vi"].includes(requestedLocale)) {
            translation = await PostTranslation.findOne({ postId: post._id, locale: requestedLocale }).lean();
        }
        if (!translation) {
            translation = await PostTranslation.findOne({ postId: post._id, locale: post.defaultLocale || "en" }).lean();
        }
        if (!translation) {
            translation = await PostTranslation.findOne({ postId: post._id }).lean();
        }

        if (translation) {
            postObj.title = translation.title;
            postObj.slug = translation.slug;
            postObj.description = translation.description;
            postObj.content = translation.content;
            postObj.text = translation.text;
            postObj.markdown = translation.markdown || (translation.content && /#{1,6}\s+/.test(translation.content) ? translation.content : undefined);
            postObj.contentVersion = translation.contentVersion;
            postObj.blocks = translation.blocks;
            postObj.hero = translation.hero;
            postObj.seo = translation.seo;
            postObj.published = translation.published;
            postObj.readtime = translation.readtime;
            postObj.currentVersionId = translation.currentVersionId || (translation.locale === (post.defaultLocale || "en") ? postObj.currentVersionId : null);
            postObj.activeLocale = translation.locale;
            postObj.translation = translation;
        } else {
            postObj.activeLocale = postObj.defaultLocale || "en";
        }

        // Fetch available translations for alternate links
        const translations = await PostTranslation.find({ postId: post._id }, { locale: 1, slug: 1, published: 1 }).lean();
        postObj.translations = translations;
        if (translations.length > 0) {
            postObj.availableLocales = translations.map(t => t.locale);
            postObj.alternateUrls = {};
            for (const t of translations) {
                if (t.published) {
                    postObj.alternateUrls[t.locale] = t.locale === "vi" ? `/vi/post/${t.slug}` : `/post/${t.slug}`;
                }
            }
        } else {
            postObj.availableLocales = postObj.availableLocales || ["en"];
            postObj.alternateUrls = { en: `/post/${postObj.slug}` };
        }

        return postObj;
    }

    async getPostBySlug(slug, requestedLocale = null) {
        let translation = null;
        const validLocale = requestedLocale && ["en", "vi"].includes(requestedLocale) ? requestedLocale : null;

        // 1. First, search in PostTranslation
        if (validLocale) {
            translation = await PostTranslation.findOne({ slug: slug, locale: validLocale, published: true }).lean();
        }
        if (!translation) {
            translation = await PostTranslation.findOne({ slug: slug, published: true }).lean();
        }

        let post = null;
        if (translation) {
            post = await Post.findOne({ _id: translation.postId, del_flag: 0 })
                .populate('category', "name slug")
                .populate('author', 'username email avatar')
                .populate('tags', 'name')
                .populate('image', 'url description')
                .populate('mediaContent', 'url type description')
                .populate('currentVersionId', 'version changelog source createdAt');
        }

        // 2. Fallback to legacy Post document lookup (for unmigrated records)
        if (!post) {
            post = await Post.findOne({ slug: slug, published: true, del_flag: 0 })
                .populate('category', "name slug")
                .populate('author', 'username email avatar')
                .populate('tags', 'name')
                .populate('image', 'url description')
                .populate('mediaContent', 'url type description')
                .populate('currentVersionId', 'version changelog source createdAt');
        }

        if (!post) {
            return null;
        }

        const postObj = post.toObject ? post.toObject() : { ...post };

        if (translation) {
            postObj.title = translation.title;
            postObj.slug = translation.slug;
            postObj.description = translation.description;
            postObj.content = translation.content;
            postObj.text = translation.text;
            postObj.contentVersion = translation.contentVersion;
            postObj.blocks = translation.blocks;
            postObj.hero = translation.hero;
            postObj.seo = translation.seo;
            postObj.published = translation.published;
            postObj.readtime = translation.readtime;
            postObj.currentVersionId = translation.currentVersionId || postObj.currentVersionId;
            postObj.activeLocale = translation.locale;
            postObj.translation = translation;

            // Compute alternate links
            const allTranslations = await PostTranslation.find({ postId: post._id, published: true }, { locale: 1, slug: 1 }).lean();
            postObj.alternateUrls = {};
            for (const t of allTranslations) {
                postObj.alternateUrls[t.locale] = t.locale === "vi" ? `/vi/post/${t.slug}` : `/post/${t.slug}`;
            }
            postObj.availableLocales = allTranslations.map(t => t.locale);
        } else {
            postObj.activeLocale = postObj.defaultLocale || "en";
            postObj.alternateUrls = { en: `/post/${postObj.slug}` };
            postObj.availableLocales = postObj.availableLocales || ["en"];
        }

        return postObj;
    }

    async getPostToEdit(postId, requestedLocale = null) {
        const post = await this.getPostById(postId, requestedLocale);
        if (!post) return null;

        const targetLocale = requestedLocale && ["en", "vi"].includes(requestedLocale) ? requestedLocale : (post.defaultLocale || "en");
        let translation = await PostTranslation.findOne({ postId, locale: targetLocale }).lean();


        if (!translation && targetLocale !== (post.defaultLocale || "en")) {
            // New translation draft requested
            return {
                ...post,
                activeLocale: targetLocale,
                isNewTranslation: true,
                title: "",
                content: "",
                text: "",
                blocks: undefined,
                hero: undefined,
                seo: undefined,
                published: false,
            };
        }

        return post;
    }

    /**
     * Batch-overlays published translations for the target locale onto a list of posts.
     * Prevents duplicate parent records and avoids N+1 queries.
     * Unpublished translation drafts are never leaked.
     */
    async overlayTranslations(posts, locale = "en") {
        if (!posts || !posts.length) return posts;
        const validLocale = ["en", "vi"].includes(locale) ? locale : "en";
        if (validLocale === "en") return posts;

        const postIds = posts.map(p => p._id).filter(Boolean);
        if (!postIds.length) return posts;

        const translations = await PostTranslation.find({
            postId: { $in: postIds },
            locale: validLocale,
            published: true
        }).lean();

        const translationMap = new Map(translations.map(t => [t.postId.toString(), t]));

        return posts.map(post => {
            const plain = typeof post.toObject === 'function' ? post.toObject() : { ...post };
            const trans = translationMap.get(plain._id?.toString());
            if (trans) {
                plain.title = trans.title || plain.title;
                plain.description = trans.description || plain.description;
                plain.slug = trans.slug || plain.slug;
                plain.locale = validLocale;
            }
            return plain;
        });
    }

    async getRecentlyData(locale = "en") {
        const validLocale = ["en", "vi"].includes(locale) ? locale : "en";
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

        const localizedPosts = await this.overlayTranslations(posts, validLocale);
        return { categories, posts: localizedPosts };
    }

    async updatePost(postId, post, locale = "en") {
        const validLocale = ["en", "vi"].includes(locale) ? locale : "en";
        const readPost = post.text ? post.text.split(" ").length / 225 : 0;
        const readtime = Math.ceil(readPost);

        const existingPost = await Post.findById(postId);
        if (!existingPost) {
            throw new NotFoundException("Post not found");
        }

        // Look for existing translation or generate slug
        const existingTranslation = await PostTranslation.findOne({ postId, locale: validLocale });
        let slug = existingTranslation?.slug || (validLocale === (existingPost.defaultLocale || "en") ? existingPost.slug : null);

        if (post.title && (post.title.trim() !== (existingTranslation?.title || existingPost.title) || !slug)) {
            slug = await this.generateUniqueSlug(post.title.trim(), postId, validLocale);
        }

        const updateObj = {
            title: post.title,
            content: post.content,
            text: post.text,
            readtime,
            slug,
        };

        if (post.markdown !== undefined) updateObj.markdown = post.markdown;
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

        // 1. Authoritative write to PostTranslation
        const updatedTranslation = await PostTranslation.findOneAndUpdate(
            { postId, locale: validLocale },
            {
                $set: {
                    ...updateObj,
                    postId,
                    locale: validLocale,
                },
            },
            { upsert: true, new: true }
        );

        // 2. Ensure availableLocales contains validLocale on Post
        const postUpdate = {
            $addToSet: { availableLocales: validLocale },
        };

        // If updating the default locale, mirror title/slug/readtime to root Post for legacy callers
        if (validLocale === (existingPost.defaultLocale || "en") || !existingPost.slug) {
            postUpdate.$set = {
                title: updateObj.title,
                content: updateObj.content,
                text: updateObj.text,
                readtime,
                slug,
                ...(updateObj.markdown ? { markdown: updateObj.markdown } : {}),
                ...(updateObj.blocks ? { blocks: updateObj.blocks } : {}),
                ...(updateObj.hero ? { hero: updateObj.hero } : {}),
                ...(updateObj.seo ? { seo: updateObj.seo } : {}),
            };
        }

        const updatedPost = await Post.findByIdAndUpdate(postId, postUpdate, { new: true });

        // Invalidate partitioned caches
        memoryCache.invalidate('hot_posts_');
        memoryCache.invalidate(`hot_posts_${validLocale}`);

        const resultObj = updatedPost.toObject ? updatedPost.toObject() : { ...updatedPost };
        resultObj.title = updatedTranslation.title;
        resultObj.slug = updatedTranslation.slug;
        resultObj.content = updatedTranslation.content;
        resultObj.text = updatedTranslation.text;
        resultObj.blocks = updatedTranslation.blocks;
        resultObj.activeLocale = validLocale;
        resultObj.translation = updatedTranslation;

        return resultObj;
    }

    async updateStatusPost(postId, published, locale = null) {
        if (locale && ["en", "vi"].includes(locale)) {
            // Update specific translation status
            await PostTranslation.findOneAndUpdate(
                { postId, locale },
                { $set: { published: Boolean(published) } }
            );
            // Recompute aggregate Post.published
            const hasPublishedTranslation = await PostTranslation.countDocuments({
                postId,
                published: true,
            });
            await Post.findByIdAndUpdate(postId, {
                published: hasPublishedTranslation > 0,
            }, { new: true });
        } else {
            // Update all translations and parent Post
            await PostTranslation.updateMany(
                { postId },
                { $set: { published: Boolean(published) } }
            );
            await Post.findByIdAndUpdate(postId, {
                published: Boolean(published),
            }, { new: true });
        }
        memoryCache.invalidate('hot_posts_');
        memoryCache.invalidate('hot_posts_en');
        memoryCache.invalidate('hot_posts_vi');
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

    async publicPost(postId, publicInfo, locale = "en") {
        const validLocale = ["en", "vi"].includes(locale) ? locale : "en";
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

            // 1. Publish the targeted translation
            await PostTranslation.findOneAndUpdate(
                { postId, locale: validLocale },
                {
                    $set: {
                        published: true,
                        publishedAt: new Date(),
                        ...(publicInfo.description ? { description: publicInfo.description } : {}),
                    },
                },
                { upsert: true, new: true }
            );

            // 2. Publish parent Post (aggregate status = true) & update shared fields
            const postUpdateFields = {
                description: publicInfo.description,
                category: publicInfo.category,
                published: true,
                $addToSet: { availableLocales: validLocale },
            };
            if (publicInfo.image) {
                if (mongoose.Types.ObjectId.isValid(publicInfo.image)) {
                    postUpdateFields.image = publicInfo.image;
                } else {
                    postUpdateFields["hero.image.src"] = publicInfo.image;
                }
            }

            const updatedPost = await Post.findByIdAndUpdate(postId, postUpdateFields, { new: true });
            
            // Ensure ArticleVersion 1.0 snapshot exists for newly published post
            const { articleVersionService } = require("./articleVersion.services");
            await articleVersionService.ensureInitialVersion(updatedPost);

            memoryCache.invalidate('hot_posts_');
            memoryCache.invalidate(`hot_posts_${validLocale}`);
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
    async fetchHotPosts({ period = 'week', limit = 10, page = 1, fallbackIfFew = true, locale = 'en' } = {}) {
        try {
            const validLocale = ["en", "vi"].includes(locale) ? locale : "en";
            const limitNum = Math.max(1, parseInt(limit) || 10);
            const pageNum = Math.max(1, parseInt(page) || 1);
            const cacheKey = `hot_posts_${period}_${limitNum}_${pageNum}_${validLocale}`;

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

            const localizedPosts = await this.overlayTranslations(posts, validLocale);
            const totalPages = Math.ceil(total / limitNum) || 1;
            const result = {
                posts: localizedPosts,
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

    async getHotPostsToday(limit, page, locale = 'en') {
        return this.fetchHotPosts({ period: 'today', limit, page, fallbackIfFew: false, locale });
    }

    async getHotPostsThisWeek(limit, page, locale = 'en') {
        return this.fetchHotPosts({ period: 'week', limit, page, fallbackIfFew: true, locale });
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

    getRecentlyDataByFeatures = async (features, locale = "en") => {
        try {
            const validLocale = ["en", "vi"].includes(locale) ? locale : "en";
            if (features === 'all' || !features) {
                const posts = await Post.find({ del_flag: 0, published: true })
                    .sort({ createdAt: -1 })
                    .limit(7)
                    .populate('category', "name slug")
                    .populate('author', 'username email avatar')
                    .populate('tags', 'name')
                    .populate('image', 'url description');
                const localizedPosts = await this.overlayTranslations(posts, validLocale);
                return { posts: localizedPosts };
            }
            const category = await Category.findOne({ slug: features });
            const posts = await Post.find({ del_flag: 0, published: true, category: category ? category._id : null })
                .sort({ createdAt: -1 })
                .limit(7)
                .populate('category', "name slug")
                .populate('author', 'username email avatar')
                .populate('tags', 'name')
                .populate('image', 'url description');

            const localizedPosts = await this.overlayTranslations(posts, validLocale);
            return { posts: localizedPosts };
        } catch (error) {
            console.log('error', error);
            throw new ServerException("error");
        }
    }

    getAllPosts = async (limit, page, locale = "en") => {
        try {
            const validLocale = ["en", "vi"].includes(locale) ? locale : "en";
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
            const localizedPosts = await this.overlayTranslations(posts, validLocale);

            return {
                posts: localizedPosts,
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

    getTop10IdeasOfMonth = async (locale = "en") => {
        try {
            const validLocale = ["en", "vi"].includes(locale) ? locale : "en";
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
            const localizedPosts = await this.overlayTranslations(posts, validLocale);

            return {
                posts: localizedPosts.map((p, idx) => ({
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
    getDiscoverySidebar = async (locale = "en") => {
        try {
            const validLocale = ["en", "vi"].includes(locale) ? locale : "en";
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const [trendingRaw, latestPostsRaw, popularSeries, featuredCourses] = await Promise.all([
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

            const [trending, latestPosts] = await Promise.all([
                this.overlayTranslations(trendingRaw, validLocale),
                this.overlayTranslations(latestPostsRaw, validLocale),
            ]);

            return { trending, latestPosts, popularSeries, featuredCourses };
        } catch (error) {
            console.error('Error fetching discovery sidebar:', error);
            throw new ServerException('Error fetching discovery sidebar data');
        }
    };

    /**
     * Locale-aware search for posts.
     * For Vietnamese: searches PostTranslation with regex on title/description to support diacritics,
     * then links back to parent post without duplicates.
     * For English: searches published parent posts.
     * Prevents draft leakage (published: true enforced).
     */
    async searchPosts(query, locale = "en", limit = 10, page = 1) {
        try {
            const validLocale = ["en", "vi"].includes(locale) ? locale : "en";
            const limitNum = Math.max(1, parseInt(limit) || 10);
            const pageNum = Math.max(1, parseInt(page) || 1);
            if (!query || !query.trim()) {
                return { posts: [], totalPosts: 0, currentPage: pageNum, totalPages: 0 };
            }

            const cleanQuery = query.trim();
            const escapeRegex = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
            const regex = new RegExp(escapeRegex(cleanQuery), "i");

            if (validLocale === "vi") {
                // Search published Vietnamese translations first
                const matchingTranslations = await PostTranslation.find({
                    locale: "vi",
                    published: true,
                    $or: [{ title: regex }, { description: regex }]
                })
                    .sort({ createdAt: -1 })
                    .skip((pageNum - 1) * limitNum)
                    .limit(limitNum)
                    .lean();

                const totalTrans = await PostTranslation.countDocuments({
                    locale: "vi",
                    published: true,
                    $or: [{ title: regex }, { description: regex }]
                });

                const postIds = matchingTranslations.map(t => t.postId);
                const parentPosts = await Post.find({
                    _id: { $in: postIds },
                    del_flag: 0,
                    published: true
                })
                    .populate('category', 'name slug')
                    .populate('author', 'username email avatar name')
                    .populate('tags', 'name')
                    .populate('image', 'url description')
                    .lean();

                const parentMap = new Map(parentPosts.map(p => [p._id.toString(), p]));
                const posts = matchingTranslations
                    .map(trans => {
                        const parent = parentMap.get(trans.postId.toString());
                        if (!parent) return null;
                        return {
                            ...parent,
                            title: trans.title || parent.title,
                            description: trans.description || parent.description,
                            slug: trans.slug || parent.slug,
                            locale: "vi"
                        };
                    })
                    .filter(Boolean);

                const totalPages = Math.ceil(totalTrans / limitNum) || 1;
                return {
                    posts,
                    totalPosts: totalTrans,
                    currentPage: pageNum,
                    totalPages
                };
            }

            // English search on parent posts
            const queryFilter = {
                del_flag: 0,
                published: true,
                $or: [{ title: regex }, { description: regex }]
            };

            const total = await Post.countDocuments(queryFilter);
            const posts = await Post.find(queryFilter)
                .sort({ createdAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .populate('category', 'name slug')
                .populate('author', 'username email avatar name')
                .populate('tags', 'name')
                .populate('image', 'url description')
                .lean();

            const totalPages = Math.ceil(total / limitNum) || 1;
            return {
                posts,
                totalPosts: total,
                currentPage: pageNum,
                totalPages
            };
        } catch (error) {
            console.error('Error in searchPosts:', error);
            throw new ServerException("Error searching posts");
        }
    }

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

    deletePostForever = async (postId) => {
        const post = await Post.findById(postId);
        if (!post) throw new NotFoundException("Post not found");

        const deletePromises = [
            Post.findByIdAndDelete(postId),
            Like.deleteMany({ post: postId }),
            PostTranslation.deleteMany({ postId: postId }),
        ];

        if (Comment) deletePromises.push(Comment.deleteMany({ post: postId }));
        if (ArticleVersion) deletePromises.push(ArticleVersion.deleteMany({ articleId: postId }));
        if (CollectionItem) deletePromises.push(CollectionItem.deleteMany({ itemType: "post", itemId: postId }));

        await Promise.all(deletePromises);
        memoryCache.invalidate('hot_posts_');
        return { success: true };
    };

    cleanTrash = async () => {
        const trashedPosts = await Post.find({ del_flag: 1 }).select('_id').lean();
        if (!trashedPosts.length) return { success: true, deleted: 0 };

        const postIds = trashedPosts.map(p => p._id);

        const deletePromises = [
            Post.deleteMany({ _id: { $in: postIds } }),
            Like.deleteMany({ post: { $in: postIds } }),
            PostTranslation.deleteMany({ postId: { $in: postIds } }),
        ];

        if (Comment) deletePromises.push(Comment.deleteMany({ post: { $in: postIds } }));
        if (ArticleVersion) deletePromises.push(ArticleVersion.deleteMany({ articleId: { $in: postIds } }));
        if (CollectionItem) deletePromises.push(CollectionItem.deleteMany({ itemType: "post", itemId: { $in: postIds } }));

        await Promise.all(deletePromises);
        memoryCache.invalidate('hot_posts_');
        return { success: true, deleted: postIds.length };
    };
};

module.exports = new PostService();
