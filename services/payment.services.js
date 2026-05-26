const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { NotFoundException, BadRequestException, ServerException } = require("../exceptions");
const { Payment, User, Course, Enrollment } = require("../models");

class PaymentService extends Service {
    /**
     * Create a pending payment from user's cart contents
     */
    async createCheckout(userId) {
        const user = await User.findById(userId)
            .select("cart enrolledCourses")
            .populate({
                path: "cart",
                match: { del_flag: 0 },
                select: "title price discountPrice slug",
                populate: { path: "thumbnail", select: "url" },
            });

        if (!user) throw new NotFoundException("User not found");
        if (!user.cart || user.cart.length === 0) {
            throw new BadRequestException("Your cart is empty");
        }

        // Filter out any courses the user is already enrolled in
        const validCourses = user.cart.filter(
            (course) => !user.enrolledCourses.some(
                (enrolledId) => enrolledId.toString() === course._id.toString()
            )
        );

        if (validCourses.length === 0) {
            throw new BadRequestException("All courses in your cart are already enrolled");
        }

        // Calculate total using discountPrice if available, otherwise price
        const amount = validCourses.reduce((total, course) => {
            const effectivePrice = (course.discountPrice && course.discountPrice > 0)
                ? course.discountPrice
                : course.price;
            return total + effectivePrice;
        }, 0);

        const payment = await Payment.create({
            _id: new mongoose.Types.ObjectId(),
            user: userId,
            courses: validCourses.map((c) => c._id),
            amount,
            currency: "VND",
            status: "pending",
            paymentMethod: "demo",
            paymentGateway: "demo",
        });

        // Populate for response
        const populatedPayment = await Payment.findById(payment._id)
            .populate({
                path: "courses",
                select: "title slug price discountPrice",
                populate: { path: "thumbnail", select: "url" },
            });

        return populatedPayment;
    }

    /**
     * Process a demo payment — atomic operation using MongoDB transaction
     * 1. Verify payment is pending and belongs to user
     * 2. Mark payment as paid
     * 3. Create enrollment for each course
     * 4. Add courses to user.enrolledCourses + purchasedCourses
     * 5. Increment course.studentsCount
     * 6. Remove purchased courses from user.cart
     */
    async processDemoPayment(paymentId, userId) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // 1. Verify payment
            const payment = await Payment.findById(paymentId).session(session);
            if (!payment) throw new NotFoundException("Payment not found");
            if (payment.user.toString() !== userId.toString()) {
                throw new BadRequestException("Payment does not belong to this user");
            }
            if (payment.status !== "pending") {
                throw new BadRequestException(`Payment is already ${payment.status}`);
            }

            const courseIds = payment.courses;

            // 2. Mark payment as paid
            payment.status = "paid";
            payment.paidAt = new Date();
            payment.transactionId = `DEMO_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            payment.gatewayResponse = { method: "demo", simulatedAt: new Date() };
            await payment.save({ session });

            // 3. Create enrollments for each course (skip if already enrolled)
            const enrollmentPromises = courseIds.map(async (courseId) => {
                const existing = await Enrollment.findOne({
                    user: userId,
                    course: courseId,
                }).session(session);

                if (existing) return existing; // Already enrolled, skip

                return Enrollment.create(
                    [{
                        _id: new mongoose.Types.ObjectId(),
                        user: userId,
                        course: courseId,
                        enrolledAt: new Date(),
                        paymentId: payment._id,
                        progress: 0,
                        completedLessons: [],
                        status: "active",
                    }],
                    { session }
                );
            });
            await Promise.all(enrollmentPromises);

            // 4. Add courses to user's enrolledCourses and purchasedCourses
            await User.findByIdAndUpdate(
                userId,
                {
                    $addToSet: {
                        enrolledCourses: { $each: courseIds },
                        purchasedCourses: { $each: courseIds },
                    },
                },
                { session }
            );

            // 5. Increment studentsCount for each course + add to enrolledUsers
            const courseUpdatePromises = courseIds.map((courseId) =>
                Course.findByIdAndUpdate(
                    courseId,
                    {
                        $inc: { studentsCount: 1 },
                        $addToSet: { enrolledUsers: userId },
                    },
                    { session }
                )
            );
            await Promise.all(courseUpdatePromises);

            // 6. Remove purchased courses from cart
            await User.findByIdAndUpdate(
                userId,
                { $pullAll: { cart: courseIds } },
                { session }
            );

            // Commit transaction
            await session.commitTransaction();
            session.endSession();

            // Return populated payment
            const result = await Payment.findById(payment._id)
                .populate({
                    path: "courses",
                    select: "title slug price discountPrice",
                    populate: { path: "thumbnail", select: "url" },
                });

            return result;
        } catch (error) {
            await session.abortTransaction();
            session.endSession();

            // Re-throw known exceptions
            if (error.status) throw error;
            throw new ServerException(`Payment processing failed: ${error.message}`);
        }
    }
}

module.exports = new PaymentService();
