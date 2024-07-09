const express = require('express');
const app = express();
const router = express.Router();
const bodyParser = require("body-parser")
const bcrypt = require("bcrypt");
const User = require('../schemas/UserSchema');

router.get("/:id", (req, res, next) => {

    if (req.session && req.session.user) {
        var payload = {
            pageTitle: "View post",
            userLoggedIn: req.session.user,
            userLoggedInJs: JSON.stringify(req.session.user),
            postId: req.params.id
        }

        res.status(200).render("postPage", payload);
        
    }
    else {

          var payload = {
            pageTitle: "View post",
            postId: req.params.id
        }
        res.status(200).render("postPage_nologin", payload);
    }


})

module.exports = router;