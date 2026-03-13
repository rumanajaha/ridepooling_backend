import Review from '../models/reviewModel.js';
import Ride from '../models/rideModel.js';

export const createReview = async (req, res) => {
  try {
    const { rideId, rating, comment } = req.body;
    const reviewerId = req.userId;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    // Get ride details
    const ride = await Ride.findById(rideId).populate('driver', 'name email');
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    // Check if reviewer is a completed passenger on this ride
    const passengerEntry = ride.passengers.find((p) => p.userId?.toString() === reviewerId);
    if (!passengerEntry) {
      return res
        .status(403)
        .json({ success: false, message: 'Only passengers can review this ride' });
    }

    if (!passengerEntry.completedByPassenger || passengerEntry.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'You can review only after completing this ride' });
    }

    // Check if ride is completed
    if (ride.rideStatus !== 'completed') {
      return res.status(400).json({ success: false, message: 'Can only review completed rides' });
    }

    // Check if already reviewed
    const existingReview = await Review.findOne({
      ride: rideId,
      reviewer: reviewerId,
    });
    if (existingReview) {
      return res
        .status(400)
        .json({ success: false, message: 'You have already reviewed this ride' });
    }

    // Create review
    const review = new Review({
      ride: rideId,
      reviewer: reviewerId,
      driver: ride.driver?._id || ride.driver,
      rating,
      comment: comment || '',
    });

    await review.save();
    await review.populate('reviewer', 'name');

    res.status(201).json({ success: true, data: review, message: 'Review created successfully', requestId: req.requestId });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create review', requestId: req.requestId });
  }
};

export const getReviewsByRide = async (req, res) => {
  try {
    const { rideId } = req.params;

    const reviews = await Review.find({ ride: rideId })
      .populate('reviewer', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: reviews, requestId: req.requestId });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch ride reviews', requestId: req.requestId });
  }
};

export const getReviewsByDriver = async (req, res) => {
  try {
    const { driverId } = req.params;

    const reviews = await Review.find({ driver: driverId })
      .populate('reviewer', 'name')
      .populate('ride', 'origin destination')
      .sort({ createdAt: -1 });

    // Calculate average rating
    const avgRating =
      reviews.length > 0
        ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
        : 0;

    res.status(200).json({ success: true, data: reviews, averageRating: avgRating, totalReviews: reviews.length, requestId: req.requestId });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch driver reviews', requestId: req.requestId });
  }
};

export const getDriverAverageRating = async (req, res) => {
  try {
    const { driverId } = req.params;

    const reviews = await Review.find({ driver: driverId });

    const averageRating =
      reviews.length > 0
        ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
        : 0;

    res.status(200).json({
      success: true,
      data: {
        averageRating: parseFloat(averageRating),
        totalReviews: reviews.length,
      },
      requestId: req.requestId,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch average rating', requestId: req.requestId });
  }
};

export const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.userId;

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    // Check if user is the reviewer
    if (review.reviewer.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Can only delete your own reviews' });
    }

    await Review.findByIdAndDelete(reviewId);

    res.status(200).json({ success: true, message: 'Review deleted successfully', requestId: req.requestId });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete review', requestId: req.requestId });
  }
};
