/**
 * Cloudflare Worker: Safe Media Gateway
 * Intercepts requests to R2 buckets and serves resized/sanitized variants.
 * Rejects decompression bombs by enforcing strict Cloudflare Image Resizing limits.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Example: https://cdn.echo-app.com/avatars/uuid.jpg
    const imagePath = url.pathname;

    // Use Cloudflare Image Resizing to sanitize the image and strip metadata
    // This implicitly validates magic bytes and throws an error if it's a malformed polyglot/bomb
    const options = {
      cf: {
        image: {
          width: 1080,
          height: 1920,
          fit: 'scale-down',
          anim: false, // Strip animations to prevent GIF memory exhaustion
          format: 'webp', // Canonical format
          metadata: 'none' // Strip malicious EXIF metadata
        }
      }
    };

    try {
      // Fetch from underlying R2 bucket
      const response = await fetch(`https://r2-internal-url${imagePath}`, options);
      
      if (!response.ok) {
        return new Response('Invalid or unprocessable media', { status: 400 });
      }

      return response;
    } catch (e) {
      // Cloudflare Image Resizing will throw if pixel limits (e.g., 100 megapixels) are exceeded
      console.error('Decompression Bomb or Malformed Image Blocked:', e);
      return new Response('Media failed safety validation', { status: 415 });
    }
  }
};
