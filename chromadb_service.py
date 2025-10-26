from flask import Flask, request, jsonify
from flask_cors import CORS
import chromadb_client
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Initialize ChromaDB client
try:
    chroma_client = chromadb_client.get_chromadb_client()
    logger.info("✅ ChromaDB client initialized successfully")
except Exception as e:
    logger.error(f"❌ Failed to initialize ChromaDB client: {e}")
    chroma_client = None

@app.route('/store-content', methods=['POST'])
def store_content():
    """Store content in ChromaDB"""
    try:
        data = request.json
        content = data.get('content')
        url = data.get('url', '')
        title = data.get('title', '')
        
        if not content:
            return jsonify({"error": "No content provided"}), 400
        
        logger.info(f"📥 Storing content - URL: {url}, Length: {len(content)}")
        
        if chroma_client:
            chroma_client.add_content(content, url, title)
            logger.info("✅ Content stored successfully")
            return jsonify({"success": True, "message": "Content stored"})
        else:
            return jsonify({"error": "ChromaDB client not initialized"}), 500
            
    except Exception as e:
        logger.error(f"❌ Error storing content: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/get-content', methods=['GET'])
def get_content():
    """Get recent content from ChromaDB"""
    try:
        limit = request.args.get('limit', 10, type=int)
        
        if chroma_client:
            results = chroma_client.get_recent_content(limit)
            return jsonify({"success": True, "data": results})
        else:
            return jsonify({"error": "ChromaDB client not initialized"}), 500
            
    except Exception as e:
        logger.error(f"❌ Error getting content: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/search-content', methods=['POST'])
def search_content():
    """Search for similar content"""
    try:
        data = request.json
        query = data.get('query')
        n_results = data.get('n_results', 5)
        
        if not query:
            return jsonify({"error": "No query provided"}), 400
        
        if chroma_client:
            results = chroma_client.search_similar_content(query, n_results)
            return jsonify({"success": True, "data": results})
        else:
            return jsonify({"error": "ChromaDB client not initialized"}), 500
            
    except Exception as e:
        logger.error(f"❌ Error searching content: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "chromadb_ready": chroma_client is not None
    })

if __name__ == '__main__':
    port = 5000
    logger.info(f"🚀 Starting ChromaDB service on port {port}")
    app.run(port=port, debug=True)
