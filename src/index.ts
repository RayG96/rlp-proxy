require('dotenv').config();
import express, { Response } from 'express';
import { getMetadata } from './lib';
import { APIOutput } from './types';
import { createClient } from '@supabase/supabase-js';

const app = express();

const SUPABASE_URL = 'https://bulawodlksxswvelfogh.supabase.co';

const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_KEY);

const port = Number(process.env.PORT || 8080);
const SERVER_URL = process.env.SERVER_URL;

interface CacheRecord extends APIOutput {
  url: string;
}

const checkForCache = async (url: string): Promise<APIOutput | null> => {
  try {
    let { data, error } = await supabase
      .from('meta-cache')
      .select('*')
      .eq('url', url);

    if (error) {
      console.log(error);
      return null;
    }

    if (data) {
      return data[0] as unknown as APIOutput;
    }

    return null;
  } catch (error) {
    console.log(error);
    return null;
  }
};

const createCache = async (data: CacheRecord): Promise<boolean> => {
  try {
    const { error } = await supabase.from('meta-cache').insert(data);
    console.log(error);
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
};

const sendResponse = (res: Response, output: APIOutput | null) => {
  if (!output) {
    return res
      .set('Access-Control-Allow-Origin', '*')
      .status(404)
      .json({ metadata: null });
  }

  return res
    .set('Access-Control-Allow-Origin', '*')
    .status(200)
    .json({ metadata: output });
};

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});

app.use(express.static('public'));

app.get('/', async (req, res) => {
  const url = req.query.url as unknown as string;
  const metadata = await getMetadata(url);
  return res
    .set('Access-Control-Allow-Origin', '*')
    .status(200)
    .json({ metadata });
});

app.get('/v2', async (req, res) => {
  try {
    let url = req.query.url as unknown as string;

    if (!url) {
      return res
        .set('Access-Control-Allow-Origin', '*')
        .status(400)
        .json({ error: 'Invalid URL' });
    }

    url = url.indexOf('://') === -1 ? 'http://' + url : url;

    const isUrlValid =
      /[(http(s)?):\/\/(www\.)?a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi.test(
        url
      );

    if (!url || !isUrlValid) {
      return res
        .set('Access-Control-Allow-Origin', '*')
        .status(400)
        .json({ error: 'Invalid URL' });
    }

    if (url && isUrlValid) {
      const { hostname } = new URL(url);

      let output: APIOutput;

      // optional - you'll need a supabase key if you want caching. highly recommended.
      const cached = await checkForCache(url);

      if (cached) {
        return res
          .set('Access-Control-Allow-Origin', '*')
          .status(200)
          .json({ metadata: cached });
      }

      const metadata = await getMetadata(url);
      if (!metadata) {
        return sendResponse(res, null);
      }
      const { images, og, meta } = metadata!;

      let image = og.image
        ? og.image
        : images.length > 0
        ? images[0].url
        : `${SERVER_URL}/img-placeholder.jpg`;
      const description = og.description
        ? og.description
        : meta.description
        ? meta.description
        : null;
      const title = (og.title ? og.title : meta.title) || '';
      const siteName = og.site_name || '';

      output = {
        title,
        description,
        image,
        siteName,
        hostname,
      };

      sendResponse(res, output);

      if (!cached && output) {
        await createCache({
          url: url,
          title: output.title,
          description: output.description,
          image: output.image,
          siteName: output.siteName,
          hostname: output.hostname,
        });
      }
    }
  } catch (error) {
    console.log(error);
    return res.set('Access-Control-Allow-Origin', '*').status(500).json({
      error:
        'Internal server error. Please open a Github issue or contact me on Twitter @dhaiwat10 if the issue persists.',
    });
  }
});
