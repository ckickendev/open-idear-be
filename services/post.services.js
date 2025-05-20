const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { Post } = require("../models");
const { Category } = require("../models");
const { User } = require("../models");
const { NotFoundException, ServerException } = require("../exceptions");

class PostService extends Service {
    async getAll() {
        const posts = await Post.find({});
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
                .populate('author', 'name email');

            const returnPosts = posts.map(post => {
                return {
                    _id: post._id,
                    title: post.title,
                    slug: post.slug,
                    content: post.content,
                    author: {
                        name: post.author.name,
                        avatar: post.author.avatar,
                    },
                    category: post.category.name,
                    tags: post.tags.map(tag => tag.name),
                    published: post.published,
                    views: post.views,
                    likes: post.likes,
                    readTime: post.readTime,
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
            author: post.author,
            category: post.category,
            tags: post.tags,
            slug
        });
        const returnPost = await Post.create(newPost);
        return returnPost;
    }

    async getPostById(postId) {
        const post = await Post.findById(postId);
        if (!post) {
            return null;
        }
        return post;
    }

    async updatePost(postId, post) {
        const updatedPost = await Post.findByIdAndUpdate(postId, {
            title: post.title,
            content: post.content,
        }, { new: true });
        return updatedPost;
    }

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
