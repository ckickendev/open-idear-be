const { Service } = require("../core");
const { NotFoundException, BadRequestException } = require("../exceptions");
const { User, Course, Enrollment } = require("../models");

class CartService extends Service {
    /**
     * Get user's cart with populated course data
     */
    async getCart(userId) {
        const user = await User.findById(userId)
            .select("cart")
            .populate({
                path: "cart",
                match: { del_flag: 0 },
                populate: [
                    { path: "instructor", select: "username name avatar" },
                    { path: "thumbnail", select: "url" },
                ],
            });

        if (!user) throw new NotFoundException("User not found");
        return { items: user.cart || [] };
    }

    /**
     * Add a course to user's cart
     * Validates: course exists, not already enrolled, not already in cart
     */
    async addToCart(userId, courseId) {
        const course = await Course.findOne({ _id: courseId, del_flag: 0 });
        if (!course) throw new NotFoundException("Course not found");

        const user = await User.findById(userId).select("cart enrolledCourses");
        if (!user) throw new NotFoundException("User not found");

        // Check if already enrolled
        if (user.enrolledCourses.some(id => id.toString() === courseId.toString())) {
            throw new BadRequestException("You are already enrolled in this course");
        }

        // Check if already in cart
        if (user.cart.some(id => id.toString() === courseId.toString())) {
            throw new BadRequestException("Course is already in your cart");
        }

        await User.findByIdAndUpdate(userId, {
            $addToSet: { cart: courseId },
        });

        return { message: "Course added to cart" };
    }

    /**
     * Remove a course from user's cart
     */
    async removeFromCart(userId, courseId) {
        const user = await User.findById(userId).select("cart");
        if (!user) throw new NotFoundException("User not found");

        if (!user.cart.some(id => id.toString() === courseId.toString())) {
            throw new BadRequestException("Course is not in your cart");
        }

        await User.findByIdAndUpdate(userId, {
            $pull: { cart: courseId },
        });

        return { message: "Course removed from cart" };
    }

    /**
     * Clear entire cart
     */
    async clearCart(userId) {
        await User.findByIdAndUpdate(userId, { cart: [] });
        return { message: "Cart cleared" };
    }
}

module.exports = new CartService();
