import Review from '../models/reviewModel.js';
import Ride from '../models/rideModel.js';

export const createReview = async (req, res) => {
  try {
    const { rideId, rating, comment } = req.body;
    const reviewerId = req.userId;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    // Get ride details
    const ride = await Ride.findById(rideId).populate('driverId');
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    // Check if reviewer is a passenger
    const isPassenger = ride.passengers.includes(reviewerId);
    if (!isPassenger) {
      return res
        .status(403)
        .json({ message: 'Only passengers can review this ride' });
    }

    // Check if ride is completed
    if (ride.rideStatus !== 'completed') {
      return res.status(400).json({ message: 'Can only review completed rides' });
    }

    // Check if already reviewed
    const existingReview = await Review.findOne({
      ride: rideId,
      reviewer: reviewerId,
    });
    if (existingReview) {
      return res
        .status(400)
        .json({ message: 'You have already reviewed this ride' });
    }

    // Create review
    const review = new Review({
      ride: rideId,
      reviewer: reviewerId,
      driver: ride.driverId._id,
      rating,
      comment: comment || '',
    });

    await review.save();
    await review.populate('reviewer', 'name');

    res.status(201).json({ data: review, message: 'Review created successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getReviewsByRide = async (req, res) => {
  try {
    const { rideId } = req.params;

    const reviews = await Review.find({ ride: rideId })
      .populate('reviewer', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({ data: reviews });
  } catch (err) {
    res.status(500).json({ message: err.message });
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

    res.status(200).json({ data: reviews, averageRating: avgRating, totalReviews: reviews.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
      data: {
        averageRating: parseFloat(averageRating),
        totalReviews: reviews.length,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.userId;

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Check if user is the reviewer
    if (review.reviewer.toString() !== userId) {
      return res.status(403).json({ message: 'Can only delete your own reviews' });
    }

    await Review.findByIdAndDelete(reviewId);

    res.status(200).json({ message: 'Review deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
