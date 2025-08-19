const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { Post, Like, Series, Category } = require("../models");
const { NotFoundException, ServerException } = require("../exceptions");

class PostService extends Service {
    async getAll() {
        const posts = await Post.find({})
            .populate('category', "name")
            .populate('author', 'username email')
            .populate('image', 'url description');
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
                .populate('category')
                .populate('tags')
                .populate('likes')
                .populate('marked')
                .populate('author', 'username email')
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
                    author: {
                        name: post.author.name,
                        avatar: post.author.avatar,
                    },
                    category: post.category ? post.category.name : "Uncategorized",
                    tags: post.tags.map(tag => tag.name),
                    published: post.published,
                    views: post.views,
                    likes: post.likes,
                    readTime: post.readtime,
                    updatedAt: post.updatedAt,
                    
                }
            });

            return returnPosts;
        } catch (error) {
            console.log('error', error);
            throw new ServerException("error");
        }

    }

    async addPost(post) {
        const slug = this.slugify(post.title);
        const newPost = new Post({
            _id: new mongoose.Types.ObjectId(),
            title: post.title,
            content: post.content,
            text: post.text,
            author: post.author,
            category: post.category,
            tags: post.tags,
            slug
        });
        const returnPost = await Post.create(newPost);
        return returnPost;
    }

    async getPostById(postId) {
        console.log('postId', postId);
        
        const post = await Post.findById(postId).populate('category', "name")
            .populate('author', 'username email')
            .populate('tags', 'name')
            .populate('image', 'url description');

        if (!post) {
            return null;
        }
        return post;
    }

    async updatePost(postId, post) {
        const updatedPost = await Post.findByIdAndUpdate(postId, {
            title: post.title,
            content: post.content,
            text: post.text,
        }, { new: true });
        return updatedPost;
    }

    async updateStatusPost(postId, published) {
        await Post.findByIdAndUpdate(postId, {
            published: published
        }, { new: true });
    }

    async getPostLikeById(userId) {
        const likePost = await Like.find({ user: userId }).populate("post");
        return likePost;
    }

    async publicPost(postId, publicInfo) {
        try {
            if(publicInfo.series) {
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

            if(publicInfo.category) {
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
            return updatedPost;
        } catch (error) {
            console.error('Error publishing post:', error);
            throw new ServerException("Error publishing post");
        }
    }

    async markedPost(postId, userId) {
        try {
            const post = await Post.findById(postId);
            if (!post) {
                throw new NotFoundException("Post not found");
            }
            if (post.marked.includes(userId)) {
                post.marked.pull(userId);
            } else {
                post.marked.push(userId);
            }
            await post.save();
            return post.marked.includes(userId);
        } catch (error) {
            console.error('Error marking post:', error);
            throw new ServerException("Error marking post");
        }
    }

    async calculateHotScore(post) {
        const now = new Date();
        const postAge = (now - post.createdAt) / (1000 * 60 * 60); // age in hours

        const likesCount = post.likes.length;
        const commentsCount = post.comments.length;
        const views = post.views;
        
        // Hot score formula (you can adjust weights)
        const score = (likesCount * 3 + commentsCount * 2 + views * 0.1) / Math.pow(postAge + 1, 0.8);

        console.log('Hot score for post', post._id, 'is', score);
        
        return score;
    };


    async getHotPostsToday(limit, page) {
        try {
            // Get posts from today
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);
            
            const posts = await Post.find({
                published: true,
                del_flag: 0,
                // createdAt: {
                //     $gte: startOfDay,
                //     $lte: endOfDay
                // }
            })
            .populate('author', 'name username avatar')
            .populate('category', 'name slug')
            .populate('tags', 'name slug')
            .populate('image', 'url description')
            .lean();

            // Calculate hot scores and sort
            const postsWithScores = posts.map(post => ({
                ...post,
                hotScore: this.calculateHotScore(post)
            }));
            
            postsWithScores.sort((a, b) => b.hotScore - a.hotScore);
            
            // Pagination
            const skip = (page - 1) * limit;
            const paginatedPosts = postsWithScores.slice(skip, skip + parseInt(limit));

            return paginatedPosts;

            
        } catch (error) {
            throw new ServerException("Error fetching hot posts");
        }
    };

    // Get hot posts for this week
    async getHotPostsThisWeek(limit, page) {
        try {
            // Get posts from this week
            const now = new Date();
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 30); // 10 days ago from now

            const posts = await Post.find({
                published: true,
                del_flag: 0,
                createdAt: {
                    $gte: sevenDaysAgo, // From 7 days ago
                    $lte: now           // Until now
                }
            })
            .populate('author', 'name username avatar')
            .populate('category', 'name slug')
            .populate('tags', 'name slug')
            .populate('image', 'url description')
            .lean();

            // console.log('posts', posts);
            
            // Calculate hot scores and sort
            const postsWithScores = posts.map(post => ({
                ...post,
                hotScore: this.calculateHotScore(post)
            }));
            
            postsWithScores.sort((a, b) => b.hotScore - a.hotScore);
            
            // Pagination
            const skip = (page - 1) * limit;
            const paginatedPosts = postsWithScores.slice(skip, skip + parseInt(limit));
            
            return paginatedPosts;
        } catch (error) {
            console.error('Error fetching hot posts this week:', error);
            res.status(500).json({
            success: false,
            message: 'Error fetching hot posts',
            error: error.message
            });
        }
    };

    // Alternative: More efficient aggregation pipeline approach
    async getHotPostsAggregation(req, res) {
        try {
            const { period = 'week', limit = 10, page = 1 } = req.query;
            
            // Calculate date range
            const now = new Date();
            let startDate;
            
            if (period === 'day') {
            startDate = new Date();
            startDate.setHours(0, 0, 0, 0);
            } else if (period === 'week') {
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 7);
            } else {
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 30); // month
            }
            
            const pipeline = [
            // Match published posts within date range
            {
                $match: {
                published: true,
                del_flag: 0,
                createdAt: { $gte: startDate }
                }
            },
            
            // Add calculated fields
            {
                $addFields: {
                likesCount: { $size: '$likes' },
                commentsCount: { $size: '$comments' },
                ageInHours: {
                    $divide: [
                    { $subtract: [now, '$createdAt'] },
                    1000 * 60 * 60 // Convert to hours
                    ]
                }
                }
            },
            
            // Calculate hot score
            {
                $addFields: {
                hotScore: {
                    $divide: [
                    {
                        $add: [
                        { $multiply: ['$likesCount', 3] },
                        { $multiply: ['$commentsCount', 2] },
                        { $multiply: ['$views', 0.1] }
                        ]
                    },
                    { $pow: [{ $add: ['$ageInHours', 1] }, 0.8] }
                    ]
                }
                }
            },
            
            // Sort by hot score
            { $sort: { hotScore: -1 } },
            
            // Pagination
            { $skip: (page - 1) * parseInt(limit) },
            { $limit: parseInt(limit) },
            
            // Populate references
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
            
            // Unwind author and category (single objects)
            { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } }
            ];
            
            const posts = await Post.aggregate(pipeline);
            
            // Get total count for pagination
            const countPipeline = [
            {
                $match: {
                published: true,
                del_flag: 0,
                createdAt: { $gte: startDate }
                }
            },
            { $count: 'total' }
            ];
            
            const countResult = await Post.aggregate(countPipeline);
            const totalPosts = countResult[0]?.total || 0;
            
            res.json({
            success: true,
            data: posts,
            pagination: {
                currentPage: parseInt(page),
                totalPosts,
                totalPages: Math.ceil(totalPosts / limit),
                hasNext: page * limit < totalPosts,
                hasPrev: page > 1
            }
            });
            
        } catch (error) {
            console.error('Error fetching hot posts:', error);
            res.status(500).json({
            success: false,
            message: 'Error fetching hot posts',
            error: error.message
            });
        }
    };

    slugify(str) {
        str = str.replace(/^\s+|\s+$/g, ''); // trim leading/trailing white space
        str = str.toLowerCase(); // convert string to lowercase
        str = str.replace(/[^a-z0-9 -]/g, '') // remove any non-alphanumeric characters
            .replace(/\s+/g, '-') // replace spaces with hyphens
            .replace(/-+/g, '-'); // remove consecutive hyphens
        return str;
    }

}

module.exports = new PostService();
