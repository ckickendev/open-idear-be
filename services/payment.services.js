const { default: mongoose } = require("mongoose");
const { Service } = require("../core");
const { NotFoundException, BadRequestException, ServerException } = require("../exceptions");
const { Payment, User, Course, Enrollment } = require("../models");
const { getPayOS } = require("../utils/payos.init");

class PaymentService extends Service {

    /**
     * Generate a unique numeric order code for payOS (required to be a positive integer).
     * Uses timestamp + random digits to ensure uniqueness.
     */
    _generateOrderCode() {
        // payOS requires orderCode to be a positive integer, max 9007199254740991
        // Use last 6 digits of timestamp + 4 random digits = 10-digit number
        const timestamp = Date.now() % 1000000;
        const random = Math.floor(1000 + Math.random() * 9000);
        return Number(`${timestamp}${random}`);
    }

    /**
     * Get valid courses from user's cart (filters already-enrolled courses)
     */
    async _getValidCartCourses(userId) {
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

        return validCourses;
    }

    /**
     * Calculate total amount from courses
     */
    _calculateAmount(courses) {
        return courses.reduce((total, course) => {
            const effectivePrice = (course.discountPrice && course.discountPrice > 0)
                ? course.discountPrice
                : course.price;
            return total + effectivePrice;
        }, 0);
    }

    /**
     * Create a pending payment — routes to demo or payOS based on gateway param
     */
    async createCheckout(userId, gateway = "demo") {
        const validCourses = await this._getValidCartCourses(userId);
        const amount = this._calculateAmount(validCourses);

        if (gateway === "payos") {
            return this._createPayosCheckout(userId, validCourses, amount);
        }

        // Default: demo checkout (existing behavior)
        return this._createDemoCheckout(userId, validCourses, amount);
    }

    /**
     * Create a demo checkout (existing logic, unchanged)
     */
    async _createDemoCheckout(userId, validCourses, amount) {
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

        const populatedPayment = await Payment.findById(payment._id)
            .populate({
                path: "courses",
                select: "title slug price discountPrice",
                populate: { path: "thumbnail", select: "url" },
            });

        return populatedPayment;
    }

    /**
     * Create a payOS checkout — generates a payment link for bank transfer
     */
    async _createPayosCheckout(userId, validCourses, amount) {
        const payos = getPayOS();
        if (!payos) {
            throw new ServerException("payOS is not configured. Please set PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY in .env");
        }

        // payOS requires amount >= 2000 VND
        if (amount < 2000) {
            throw new BadRequestException("Số tiền thanh toán tối thiểu là 2,000 VND");
        }

        const orderCode = this._generateOrderCode();

        // Build items list for payOS
        const items = validCourses.map((course) => ({
            name: course.title.substring(0, 256), // payOS max 256 chars
            quantity: 1,
            price: (course.discountPrice && course.discountPrice > 0)
                ? course.discountPrice
                : course.price,
        }));

        // Description: max 25 characters for payOS
        const description = `OI ${orderCode}`;

        const frontendUrl = process.env.ROOT_FRONTEND || "http://localhost:3000";

        // Create payment link via payOS SDK
        const payosResponse = await payos.createPaymentLink({
            orderCode,
            amount,
            description,
            items,
            returnUrl: `${frontendUrl}/checkout?status=success&orderCode=${orderCode}`,
            cancelUrl: `${frontendUrl}/checkout?status=cancel&orderCode=${orderCode}`,
        });

        // Save payment record
        const payment = await Payment.create({
            _id: new mongoose.Types.ObjectId(),
            user: userId,
            courses: validCourses.map((c) => c._id),
            amount,
            currency: "VND",
            status: "pending",
            paymentMethod: "bank_transfer",
            paymentGateway: "payos",
            payosOrderCode: orderCode,
            payosPaymentLinkId: payosResponse.paymentLinkId || null,
            checkoutUrl: payosResponse.checkoutUrl,
        });

        const populatedPayment = await Payment.findById(payment._id)
            .populate({
                path: "courses",
                select: "title slug price discountPrice",
                populate: { path: "thumbnail", select: "url" },
            });

        return {
            ...populatedPayment.toObject(),
            checkoutUrl: payosResponse.checkoutUrl,
        };
    }

    /**
     * Process enrollment atomically (shared between demo and payOS flows)
     * Uses MongoDB transaction to ensure all-or-nothing.
     */
    async _processEnrollments(paymentId, userId, courseIds, transactionMeta = {}) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // 1. Verify payment
            const payment = await Payment.findById(paymentId).session(session);
            if (!payment) throw new NotFoundException("Payment not found");
            if (payment.status !== "pending") {
                throw new BadRequestException(`Payment is already ${payment.status}`);
            }

            // 2. Mark payment as paid
            payment.status = "paid";
            payment.paidAt = new Date();
            payment.transactionId = transactionMeta.transactionId || `TXN_${Date.now()}`;
            payment.gatewayResponse = transactionMeta.gatewayResponse || null;
            await payment.save({ session });

            // 3. Create enrollments for each course (skip if already enrolled)
            const enrollmentPromises = courseIds.map(async (courseId) => {
                const existing = await Enrollment.findOne({
                    user: userId,
                    course: courseId,
                }).session(session);

                if (existing) return existing;

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

            // 5. Increment studentsCount for each course
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
            if (error.status) throw error;
            throw new ServerException(`Payment processing failed: ${error.message}`);
        }
    }

    /**
     * Process a demo payment (wraps shared enrollment logic)
     */
    async processDemoPayment(paymentId, userId) {
        const payment = await Payment.findById(paymentId);
        if (!payment) throw new NotFoundException("Payment not found");
        if (payment.user.toString() !== userId.toString()) {
            throw new BadRequestException("Payment does not belong to this user");
        }

        return this._processEnrollments(paymentId, userId, payment.courses, {
            transactionId: `DEMO_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            gatewayResponse: { method: "demo", simulatedAt: new Date() },
        });
    }

    /**
     * Process payOS webhook — called when payOS confirms a payment
     */
    async processPayosWebhook(webhookBody) {
        const payos = getPayOS();
        if (!payos) {
            throw new ServerException("payOS is not configured");
        }

        // Verify webhook signature
        let webhookData;
        try {
            webhookData = payos.verifyPaymentWebhookData(webhookBody);
        } catch (err) {
            console.error("[payOS Webhook] Signature verification failed:", err.message);
            throw new BadRequestException("Invalid webhook signature");
        }

        // payOS test webhook (orderCode === 123) — just return OK
        if (webhookData.orderCode === 123) {
            console.log("[payOS Webhook] Test webhook received, ignoring");
            return { success: true, test: true };
        }

        const orderCode = webhookData.orderCode;

        // Find payment by orderCode
        const payment = await Payment.findOne({ payosOrderCode: orderCode });
        if (!payment) {
            console.error(`[payOS Webhook] Payment not found for orderCode: ${orderCode}`);
            throw new NotFoundException(`Payment not found for orderCode: ${orderCode}`);
        }

        // Already processed — idempotent response
        if (payment.status === "paid") {
            console.log(`[payOS Webhook] Payment ${payment._id} already paid, skipping`);
            return { success: true, alreadyProcessed: true };
        }

        // Only process if payment code indicates success
        if (webhookData.code === "00") {
            return this._processEnrollments(payment._id, payment.user, payment.courses, {
                transactionId: webhookData.reference || `PAYOS_${orderCode}`,
                gatewayResponse: webhookData,
            });
        } else {
            // Payment failed or cancelled
            payment.status = "failed";
            payment.gatewayResponse = webhookData;
            await payment.save();
            console.log(`[payOS Webhook] Payment ${payment._id} marked as failed. Code: ${webhookData.code}`);
            return { success: false, status: "failed" };
        }
    }

    /**
     * Get payment status by payOS orderCode (for return URL verification)
     */
    async getPaymentByOrderCode(orderCode, userId) {
        const payment = await Payment.findOne({
            payosOrderCode: Number(orderCode),
            user: userId,
        }).populate({
            path: "courses",
            select: "title slug price discountPrice",
            populate: { path: "thumbnail", select: "url" },
        });

        if (!payment) throw new NotFoundException("Payment not found");
        return payment;
    }
}

module.exports = new PaymentService();

