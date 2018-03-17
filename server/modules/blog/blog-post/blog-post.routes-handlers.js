"use strict";

const path = require("path");
const gstore = require("gstore-node")();

const blogPostDomain = require("./blog-post.domain");
const { handleError, pageNotFound } = require("../../exceptions/routes");
const templates = path.join(__dirname, "..", "views");

const index = async (req, res) => {
    const template = path.join(templates, "index");
    let posts;

    try {
        posts = await blogPostDomain.getPosts();
    } catch (error) {
        return res.render(template, {
            blogPosts: [],
            error
        });
    }

    res.render(template, {
        blogPosts: posts.entities,
        pageId: "home"
    });
};

const detail = async (req, res) => {
    /**
     * Create Dataloader instance, unique to this request
     */
    const dataloader = gstore.createDataLoader();
    const template = path.join(templates, "detail");

    let post;
    try {
        post = await blogPostDomain.getPost(req.params.id, dataloader);
    } catch (error) {
        if (error.code === "ERR_ENTITY_NOT_FOUND") {
            return pageNotFound(res);
        }

        return handleError(res, {
            template,
            error,
            data: { post: null }
        });
    }

    return res.render(template, {
        pageId: "blogpost-view",
        post
    });
};

const deletePost = async (req, res) => {
    let result;
    try {
        result = await blogPostDomain.deletePost(req.params.id);
    } catch (err) {
        return res.status(401).send({ error: err.message });
    }

    if (!result.success) {
        return res.status(400).json(result);
    }

    return res.json(result);
};

module.exports = {
    index,
    detail,
    deletePost
};