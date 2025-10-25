LETTA API DEBUGGING GUIDE

I added detailed logging to help debug the Letta API issue.

After reloading the extension, check the console for:

1. 📤 URL: Should show the full API endpoint
2. 📤 API Key: Should show first 20 chars of your key
3. 📤 Project: Should show your project ID
4. 📤 Request body: Shows what we're sending
5. 📥 Response status: HTTP status code
6. ❌ If error: Shows the error message from Letta

COMMON ISSUES:

1. "Failed to fetch" - Could be:
   - CORS issue (Letta might not allow browser requests)
   - Network connectivity
   - Incorrect API endpoint
   - SSL/TLS issues

2. 401 Unauthorized - Check:
   - API key is correct
   - Bearer token format
   
3. 404 Not Found - Check:
   - Agent ID is correct
   - Project ID is correct
   - API endpoint is correct

4. 400 Bad Request - Check:
   - Request body format
   - Missing required fields

Let me know what you see in the console!
