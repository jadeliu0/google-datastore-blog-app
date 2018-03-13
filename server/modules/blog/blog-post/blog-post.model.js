"use strict";

const gstore = require("gstore-node")();
const R = require("ramda");

const imagesHelpers = require("../../../helpers/images");
const stringHelpers = require("../../../helpers/string");

const Schema = gstore.Schema;

/**
 * Define the Schema for our BlogPost model
 */
const schema = new Schema({
    title: { type: "string" },
    createdOn: { type: "datetime", default: gstore.defaultValues.NOW, read: false, write: false },
    modifiedOn: { type: "datetime", default: gstore.defaultValues.NOW },
    content: { type: "string", excludeFromIndexes: true },
    excerpt: { type: "string", excludeFromIndexes: true },
    posterUri: { type: "string" },
    cloudStorageObject: { type: "string" }
});

// -------------------------------------
// Queries Shortcuts
// -------------------------------------
/**
 * Define default configuration for our Model.list() shortcut
 */
schema.queries("list", {
    order: { property: "modifiedOn", descending: true },
    ancestors: ["Blog", "default"]
});

// -------------------------------------
// HOOKS
// -------------------------------------
/**
 * Hooks to run before *saving* the entity
 * In "pre.save" hooks, the scope "this" is the entity being saved
 * In "pre.delete" hooks, the scope is also the entity being deleted but does not have any data.
 */
schema.pre("save", [deletePreviousImage, prepareEntityData]);

/**
 * Hooks to run before deleting the entity
 */
schema.pre("delete", deleteCloudStorageObject);

/**
 * Hooks to run after deleting the entity
 */
schema.post("delete", deleteComments);

// -------------------------------------

/**
 * If entity exists (has an id) and we are sending "null" as poster uri
 * or there is a "file" object in the entityData, we fetch the entity to see if
 * it already has an image.
 *
 * Here we don't use the datastoreEntity() shortcut as it would merge the datastore
 * data into our entity and override our changes on it
 * We simply use the dataloader for the fetching.
 */
function deletePreviousImage() {
    if (this.entityKey.id && (this.posterUri === null || typeof this.entityData.file !== 'undefined')) {
        return this.dataloader.load(this.entityKey).then(entity => {
            if (!entity || !entity.cloudStorageObject) {
                return;
            }
            return imagesHelpers.deleteFromGCS(entity.cloudStorageObject);
        });
    }
    return Promise.resolve();
}

function prepareEntityData() {
    /**
     * rambda "compose" execute the pure functions from right --> left
     */
    this.entityData = R.compose(createExcerpt, sanitize, addPosterUri)(
        this.entityData
    );

    return Promise.resolve();
}

/**
 * If the entity has a "file" attached to it
 * we save its publicUrl (to posterUri) and cloudStorageObject information
 */
function addPosterUri(entityData) {
    if (entityData.file) {
        return {
            ...entityData,
            posterUri: entityData.file.cloudStoragePublicUrl || null,
            cloudStorageObject: entityData.file.cloudStorageObject || null
        };
    } else if (entityData.posterUri === null) {
        /**
         * Make sure that if the posterUri is null
         * the cloud storage object is also null
         */
        return { ...entityData, cloudStorageObject: null };
    }
    return entityData;
}

/**
 * Access the model with gstore.model() and sanitize the entityData
 */
function sanitize(entityData) {
    return gstore.model("BlogPost").sanitize(entityData);
}

/**
 * Automatically generate an excerpt based on the "content"
 */
function createExcerpt(entityData) {
    return {
        ...entityData,
        excerpt: stringHelpers.createExcerpt(entityData.content)
    };
}

/**
 * Hook to delete image from GCS before we delete a post
 */
function deleteCloudStorageObject() {
    // We fetch the entityData to see if there is a cloud storage object
    return this.datastoreEntity().then(entity => {
        if (!entity || !entity.cloudStorageObject) {
            return;
        }
        return imagesHelpers.deleteFromGCS(entity.cloudStorageObject);
    });
}

/**
 * Hook to delete all the comments after a BlogPost has been deleted
 *
 * @param {*} result The result of the delete of the BlogPost
 *                   It contains the key of the entity deleted
 */
function deleteComments(result) {
    const { id } = result.key;

    /**
     * A keys-only query returns just the keys of the result entities instead of
     * the entities themselves, at lower latency and cost.
     */
    return gstore.model('Comment')
        .query()
        .filter("blogPost", id)
        .select('__key__')
        .run()
        .then(({ entities }) => (
            gstore.ds.delete(entities.map(entity => entity[gstore.ds.KEY]))
        ));
}

module.exports = gstore.model("BlogPost", schema);
