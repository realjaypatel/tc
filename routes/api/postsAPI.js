const express = require('express');
const app = express();
const router = express.Router();
const bodyParser = require("body-parser")
const User = require('../../schemas/UserSchema');
const Post = require('../../schemas/PostSchema');
const Notification = require('../../schemas/NotificationSchema');
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const upload = multer({ dest: "uploads/" }); 

app.use(express.urlencoded({ extended: false }));

router.get("/", async (req, res, next) => {

    var searchObj = req.query; 

    //Prepare searchObj for getPosts(filter)
    if(searchObj.isReply !== undefined)
    {
        var isReply = searchObj.isReply == "true";
        searchObj.replyTo = { $exists: isReply };
        delete searchObj.isReply; //delete property from JS object
    }

    //Case in-sensitive search
    if(searchObj.search !== undefined)
    {
        searchObj.content = { $regex: searchObj.search, $options: "i" };
        delete searchObj.search;
    }

    //Only show if following
    if(searchObj.followingOnly !== undefined) {
        var followingOnly = searchObj.followingOnly == "true";

        if(followingOnly) {
            var objectIds = [];
            
            //Checks if array does NOT exist //Error handling
            if(!req.session.user.following) {
                req.session.user.following = [];
            }

            req.session.user.following.forEach(user => {
                objectIds.push(user);
            })

            objectIds.push(req.session.user._id);
            searchObj.postedBy = { $in: objectIds };
        }
        
        delete searchObj.followingOnly;
    }

    var results = await getPosts(searchObj);
    res.status(200).send(results);
})
router.get("/global", async (req, res, next) => {

    var searchObj = req.query; 

    //Prepare searchObj for getPosts(filter)
    if(searchObj.isReply !== undefined)
    {
        var isReply = searchObj.isReply == "true";
        searchObj.replyTo = { $exists: isReply };
        delete searchObj.isReply; //delete property from JS object
    }

    //Case in-sensitive search
    if(searchObj.search !== undefined)
    {
        searchObj.content = { $regex: searchObj.search, $options: "i" };
        delete searchObj.search;
    }

    //Only show if following
    if(searchObj.followingOnly !== undefined) {
        var followingOnly = searchObj.followingOnly == "true";

        if(followingOnly) {
            var objectIds = [];
            
            //Checks if array does NOT exist //Error handling
            if(!req.session.user.following) {
                req.session.user.following = [];
            }

            req.session.user.following.forEach(user => {
                objectIds.push(user);
            })

            objectIds.push(req.session.user._id);
            searchObj.postedBy = { $in: objectIds };
        }
        
        delete searchObj.followingOnly;
    }
    
    var results = await getPosts({});
    solution  =[]
    results.forEach(post => {
        // Check if the post has a replyTo value
        if (post.replyTo) {

        } else {
            solution.push(post)
        }
    });

    res.status(200).send(solution);
})
router.get("/:id", async (req, res, next) => {

    var postId = req.params.id;

    var postData = await getPosts({ _id: postId });
    postData = postData[0];

    var results = {
        postData: postData
    }

    if(postData.replyTo !== undefined) 
    {
        results.replyTo = postData.replyTo;
    }

    results.replies = await getPosts({ replyTo: postId });

    res.status(200).send(results);
})

router.post("/", async (req, res, next) => {
    if(!req.body.content)
    {
        console.log("Content param not sent with request");
        return res.sendStatus(400);
    }

    var postData = {
        content: req.body.content,
        postedBy: req.session.user
    }

    if(req.body.replyTo)
    {
        postData.replyTo = req.body.replyTo;
    }

    Post.create(postData)
    .then(async (newPost) => {
        newPost = await User.populate(newPost, { path: "postedBy" })
        newPost = await Post.populate(newPost, { path: "replyTo" })

        if(newPost.replyTo !== undefined)
        {
            await Notification.insertNotification(newPost.replyTo.postedBy, req.session.user._id, "reply", newPost._id);
        }

        res.status(201).send(newPost);
    })
    .catch((error) => {
        console.log(error);
        res.sendStatus(400);
    })


    
})

router.put("/:id/like", async (req, res, next) => {

    var postId = req.params.id;
    var userId = req.session.user._id;

    //Decide whether like or unlike
    var isLiked = req.session.user.likes && req.session.user.likes.includes(postId); 


    var option = isLiked == true ? "$pull" : "$addToSet";

    // Insert/pull user like
    //Checks if likes [array] exists (error handling)
    //req.session.user updated after operation 
    req.session.user = await User.findByIdAndUpdate(userId, { [option]: { likes: postId } }, { new: true })
    .catch(error => {
        console.log(error);
        res.sendStatus(400);
    })

    // Insert/pull post like
    var post = await Post.findByIdAndUpdate(postId, { [option]: { likes: userId } }, { new: true })
    .catch(error => {
        console.log(error);
        res.sendStatus(400);
    })

    if(!isLiked)
    {
        await Notification.insertNotification(post.postedBy, userId, "postLike", post._id);
    }

    res.status(200).send(post);
})

router.post("/:id/retweet", async (req, res, next) => {
    var postId = req.params.id;
    var userId = req.session.user._id;

    //Try and delete retweet
    var deletedPost = await Post.findOneAndDelete({ postedBy: userId, retweetData: postId })
    .catch(error => {
        console.log(error);
        res.sendStatus(400);
    })

    var option = deletedPost != null ? "$pull" : "$addToSet";

    var repost = deletedPost;

    if(repost == null)
    {
        repost = await Post.create({ postedBy: userId, retweetData: postId })
        .catch(error => {
            console.log(error);
            res.sendStatus(400);
        })
    }

    // Insert/pull user retweet
    req.session.user = await User.findByIdAndUpdate(userId, { [option]: { retweets: repost._id } }, { new: true })
    .catch(error => {
        console.log(error);
        res.sendStatus(400);
    })

    // Insert/pull post retweet
    var post = await Post.findByIdAndUpdate(postId, { [option]: { retweetUsers: userId } }, { new: true })
    .catch(error => {
        console.log(error);
        res.sendStatus(400);
    })

    if(!deletedPost)
    {
        await Notification.insertNotification(post.postedBy, userId, "retweet", post._id);
    }

    res.status(200).send(post);
})

router.delete("/:id", (req, res, next) => {
    Post.findByIdAndDelete(req.params.id)
    .then(() => res.sendStatus(202))
    .catch(error => {
        console.log(error);
        res.sendStatus(400);
    })
})


router.put("/:id", async (req, res, next) => {

    //Set all our posts to pinned==false
    //Current allows one pinned post
    if(req.body.pinned !== undefined)
    {
        await Post.updateMany({postedBy: req.session.user }, { pinned: false })
        .catch(error => {
            console.log(error);
            res.sendStatus(400);
        })
    }

    Post.findByIdAndUpdate(req.params.id, req.body)
    .then(() => res.sendStatus(204))
    .catch(error => {
        console.log(error);
        res.sendStatus(400);
    })
})

router.post("/photopost", upload.single("photo"), async (req, res) => {


    photoname = ''
    

    try {
        // Check if a file was uploaded
        if (req.file) {
           
            try {
                var filePath = `/uploads/post/${req.file.filename}.png`;
                var tempPath = req.file.path;
                var targetPath = path.join(__dirname, `../../${filePath}`);
            
                fs.rename(tempPath, targetPath, async error => {
                    if(error != null) 
                    {
                        console.log(error);
                        return res.sendStatus(400);
                    }

                });
                photoname = `/uploads/post/${req.file.filename}.png`
            } catch (error) {
                return res.sendStatus(400)
            }
        }
    
        // Create a new post with photo information
        const postData = {
            content: req.body.content,
            postedBy: req.session.user,
            photo:photoname,
            desc:req.body.desc // Assuming Multer saves the file path in req.file.path
        };

        // Save the new post to the database
        const newPost = await Post.create(postData);

        // Populate user and notification logic if needed
        await User.populate(newPost, { path: "postedBy" });
        if (newPost.replyTo !== undefined) {
            await Notification.insertNotification(newPost.replyTo.postedBy, req.session.user._id, "reply", newPost._id);
        }

        res.status(201).send(newPost);
    } catch (error) {
        console.error(error);
        res.status(400).send({ success: false, message: "An error occurred while creating the photo post." });
    }
});
async function getPosts(filter)
{
    var results = await Post.find(filter)
    .populate("postedBy")
    .populate("retweetData")
    .populate("replyTo")
    .sort({ "createdAt": -1 }) //Sort by Descending order
    .catch(error => console.log(error))

    results = await User.populate(results, { path: "replyTo.postedBy" });
    return await User.populate(results, { path: "retweetData.postedBy" });
}

module.exports = router;