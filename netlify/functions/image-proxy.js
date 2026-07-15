const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const key = event.queryStringParameters?.key;
  if (!key) return { statusCode: 400, body: 'Missing key' };

  try {
    const store = getStore('recipe-images');
    const result = await store.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!result) return { statusCode: 404, body: 'Not found' };

    const contentType = result.metadata?.contentType || 'image/jpeg';
    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000'
      },
      body: Buffer.from(result.data).toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
