// Serves images from Netlify Blobs
import { getStore } from '@netlify/blobs';

export default async (req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (!key) return new Response('Missing key', { status: 400 });

  const store = getStore('recipe-images');
  const result = await store.getWithMetadata(key, { type: 'arrayBuffer' });
  if (!result) return new Response('Not found', { status: 404 });

  const contentType = result.metadata?.contentType || 'image/jpeg';
  return new Response(result.data, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000'
    }
  });
};

export const config = { path: '/api/image' };
