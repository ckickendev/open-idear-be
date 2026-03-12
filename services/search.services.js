const { MeiliSearch } = require('meilisearch');

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || 'http://127.0.0.1:7700',
  apiKey: process.env.MEILISEARCH_API_KEY || 'masterKey',
});

const searchService = {
  /**
   * Add or update documents in an index
   * @param {string} indexUid - The index name (e.g., 'posts', 'courses')
   * @param {Array<Object>} documents - Array of documents to index
   */
  async addDocuments(indexUid, documents) {
    try {
      const formattedDocs = documents.map(doc => {
        const docObj = doc.toObject ? doc.toObject() : { ...doc };
        if (docObj._id && !docObj.id) {
          docObj.id = docObj._id.toString();
        }
        return docObj;
      });

      const index = client.index(indexUid);
      const response = await index.addDocuments(formattedDocs);
      return response;
    } catch (error) {
      console.error(`Error adding documents to Meilisearch index '${indexUid}':`, error);
      throw error;
    }
  },

  /**
   * Search within an index
   * @param {string} indexUid - The index name
   * @param {string} query - The search string
   * @param {Object} options - Search options (limit, offset, filter, etc.)
   */
  async search(indexUid, query, options = {}) {
    try {
      const index = client.index(indexUid);
      const searchResults = await index.search(query, options);
      return searchResults;
    } catch (error) {
      console.error(`Error searching in Meilisearch index '${indexUid}':`, error);
      throw error;
    }
  },

  /**
   * Delete a document from an index
   * @param {string} indexUid - The index name
   * @param {string} documentId - The ID of the document to delete
   */
  async deleteDocument(indexUid, documentId) {
    try {
      const index = client.index(indexUid);
      const response = await index.deleteDocument(documentId);
      return response;
    } catch (error) {
      console.error(`Error deleting document from '${indexUid}':`, error);
      throw error;
    }
  },

  /**
   * Initialize Meilisearch index settings
   * @param {string} indexUid 
   * @param {Object} settings 
   */
  async setupIndex(indexUid, settings) {
    try {
      const index = client.index(indexUid);
      const response = await index.updateSettings(settings);
      return response;
    } catch (error) {
      console.error(`Error setting up Meilisearch index '${indexUid}':`, error);
      throw error;
    }
  }
};

module.exports = searchService;
