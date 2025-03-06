import bcrypt from "bcryptjs";
import {v2 as cloudinary} from "cloudinary";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";


export const getUserProfile = async (req, res) => {
  const { username } = req.params;

  try {
    const user = await User.findOne({ username }).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ user });
  } catch (error) {
    console.log("Error in getUserProfile", error);
    res.status(500).json({ error: error.message });
  }
};

export const followUnfollowUser = async (req, res) => {
  try {
    const { id } = req.params;
    const userToModify = await User.findById(id);
    const currentUser = await User.findById(req.user._id);

    if (id === req.user._id.toString()) {
      return res
        .status(400)
        .json({ message: "You can't follow or unfollow yourself" });
    }

    if (!userToModify || !currentUser)
      return res.status(400).json({ error: "User not found" });

    const isFollowing = userToModify.followers.includes(currentUser._id);

    if (isFollowing) {
      // unfollow user
      await User.findByIdAndUpdate(id, { $pull: { followers: req.user._id } });
      await User.findByIdAndUpdate(req.user._id, { $pull: { following: id } });

      res.status(200).json({ message: "User unfollowed successfully" });
    } else {
      // follow user
      await User.findByIdAndUpdate(id, { $push: { followers: req.user._id } });
      await User.findByIdAndUpdate(req.user._id, { $push: { following: id } });

      // send notification
      const newNotification = new Notification({
        type: "follow",
        from: req.user._id,
        to: userToModify._id,
      });

      await newNotification.save();

      res.status(200).json({ message: "User followed successfully" });

      // TODO: Return the id of the user as a response
    }
  } catch (error) {
    console.log("Error in followUnfollowUser", error);
    res.status(500).json({ error: error.message });
  }
};

export const updateUserProfile = async (req, res) => {
    const { fullName, email, username, currentPassword, newPassword, bio, link } = req.body;
    let { profileImg, coverImg } = req.body;

    const userId = req.user._id;

    try {
        let user = await User.findById(userId);
        if(!user) return res.status(404).json({ message: "User not found" });

        // Ensure both current and new password are provided together
        if ((!newPassword && currentPassword) || (!currentPassword && newPassword)) {
            return res.status(400).json({ message: "Please enter both current and new password" });
        }

        // Log newPassword for debugging
        console.log("New Password:", newPassword);  // Log newPassword for debugging

        // Check password validity
        if (newPassword && currentPassword) {
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) return res.status(400).json({ message: "Invalid password" });
            if (newPassword.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

            // Hash the new password only if it's defined and valid
            if (!newPassword) {
                return res.status(400).json({ message: "New password is required" });
            }

            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(newPassword, salt);
        }

        // Handle image uploads and cloudinary
        if (profileImg) {
            if (user.profileImg) {
                const publicId = user.profileImg.split("/").pop().split(".")[0];
                await cloudinary.uploader.destroy(publicId);
            }

            const uploadedResponse = await cloudinary.uploader.upload(profileImg);
            profileImg = uploadedResponse.secure_url;
        }

        if (coverImg) {
            if (user.coverImg) {
                const publicId = user.coverImg.split("/").pop().split(".")[0];
                await cloudinary.uploader.destroy(publicId);
            }

            const uploadedResponse = await cloudinary.uploader.upload(coverImg);
            coverImg = uploadedResponse.secure_url;
        }

        // Update user details
        user.fullName = fullName || user.fullName;
        user.email = email || user.email;
        user.username = username || user.username;
        user.bio = bio || user.bio;
        user.link = link || user.link;
        user.profileImg = profileImg || user.profileImg;
        user.coverImg = coverImg || user.coverImg;

        // Save the user document
        user = await user.save();

        // Password should not be returned in the response
        const userData = {
            fullName: user.fullName,
            email: user.email,
            username: user.username,
            bio: user.bio,
            link: user.link,
            profileImg: user.profileImg,
            coverImg: user.coverImg,
        };

        return res.status(200).json({ user: userData });

    } catch (error) {
        console.log("Error in updateUserProfile", error);
        res.status(500).json({ error: error.message });
    }
};


export const getSuggestedUsers = async (req, res) => {
  try {
    const userId = req.user._id;

    const usersFollowedByMe = await User.findById(userId).select("following");

    const users = await User.aggregate([
      {
        $match: {
          _id: { $ne: userId },
        },
      },
      { $sample: { size: 5 } },
    ]);

    const filteredUsers = users.filter(
      (user) => !usersFollowedByMe.following.includes(user._id)
    );
    const suggestedUsers = filteredUsers.slice(0, 4);

    suggestedUsers.forEach((user) => (user.password = null));

    res.status(200).json(suggestedUsers);
  } catch (error) {
    console.log("Error in getSuggestedUsers", error.message);
    res.status(500).json({ error: error.message });
  }
};
