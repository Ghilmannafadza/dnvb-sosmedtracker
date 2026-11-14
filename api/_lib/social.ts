import type { RawItem, SourceKey, TopicQuery } from '../../shared/types.js';
import { fetchJson, hashId, stripHtml, toIso } from './http.js';
import { primaryTerms, webQuery } from './query.js';

const num = (v: any) => (v == null || v === '' || isNaN(Number(v)) ? undefined : Number(v));

/* ------------------------------- YouTube ------------------------------- */
export async function youtube(q: TopicQuery, from: string, to: string): Promise<RawItem[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY belum diisi');
  const query = webQuery({ ...q, context: [] }).replace(/ OR /g, '|');
  const sUrl =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&order=date&regionCode=ID` +
    `&relevanceLanguage=id&publishedAfter=${new Date(from).toISOString()}&publishedBefore=${new Date(to).toISOString()}` +
    `&q=${encodeURIComponent(query)}&key=${key}`;
  const s = await fetchJson<any>(sUrl);
  const ids: string[] = (s.items || []).map((i: any) => i.id?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const v = await fetchJson<any>(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(',')}&key=${key}`,
  );
  const videos: RawItem[] = (v.items || []).map((it: any) => ({
    id: 'yt_' + it.id,
    source: 'youtube',
    channel: 'social',
    outlet: 'YouTube',
    domain: 'youtube.com',
    url: `https://www.youtube.com/watch?v=${it.id}`,
    title: stripHtml(it.snippet?.title),
    snippet: stripHtml(it.snippet?.description || '').slice(0, 500),
    author: it.snippet?.channelTitle,
    publishedAt: toIso(it.snippet?.publishedAt),
    image: it.snippet?.thumbnails?.medium?.url,
    engagement: {
      views: num(it.statistics?.viewCount),
      likes: num(it.statistics?.likeCount),
      comments: num(it.statistics?.commentCount),
    },
    kind: 'video',
  }));

  // Komentar publik dari video yang paling banyak dikomentari (suara warganet)
  const top = [...videos]
    .sort((a, b) => (b.engagement?.comments || 0) - (a.engagement?.comments || 0))
    .filter((x) => (x.engagement?.comments || 0) > 0)
    .slice(0, 4);
  const comments = await Promise.all(
    top.map(async (vid) => {
      try {
        const c = await fetchJson<any>(
          `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&maxResults=30&order=relevance&videoId=${vid.id.slice(3)}&key=${key}`,
        );
        return (c.items || []).map((ct: any) => {
          const sn = ct.snippet?.topLevelComment?.snippet || {};
          return {
            id: 'ytc_' + ct.id,
            source: 'youtube',
            channel: 'social',
            outlet: 'YouTube (komentar)',
            domain: 'youtube.com',
            url: `${vid.url}&lc=${ct.id}`,
            title: stripHtml(sn.textDisplay || '').slice(0, 280),
            snippet: `Komentar pada video: ${vid.title}`,
            author: sn.authorDisplayName,
            publishedAt: toIso(sn.publishedAt),
            engagement: { likes: num(sn.likeCount), comments: num(ct.snippet?.totalReplyCount) },
            kind: 'comment',
          } as RawItem;
        });
      } catch {
        return [] as RawItem[];
      }
    }),
  );
  return [...videos, ...comments.flat()];
}

/* -------------------------------- Reddit -------------------------------- */
export async function reddit(q: TopicQuery, from: string): Promise<RawItem[]> {
  const query = primaryTerms(q, 4)
    .map((t) => (t.includes(' ') ? `"${t}"` : t))
    .join(' OR ');
  const j = await fetchJson<any>(
    `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=100&t=year`,
    { headers: { 'User-Agent': 'dnvb-sosmedtracker/2.0 (media monitoring)' } },
  );
  const min = new Date(from).getTime();
  return (j?.data?.children || [])
    .map((c: any) => c.data)
    .filter((d: any) => d && d.created_utc * 1000 >= min)
    .map(
      (d: any): RawItem => ({
        id: 'rd_' + d.id,
        source: 'reddit',
        channel: 'social',
        outlet: `Reddit r/${d.subreddit}`,
        domain: 'reddit.com',
        url: 'https://www.reddit.com' + d.permalink,
        title: stripHtml(d.title),
        snippet: stripHtml(d.selftext || '').slice(0, 500),
        author: d.author,
        publishedAt: toIso(d.created_utc),
        engagement: { likes: num(d.ups), comments: num(d.num_comments) },
        kind: 'post',
      }),
    );
}

/* ------------------------------ Apify (Instagram/TikTok/Threads/X/FB) ------------------------------ */
// Actor dan input dapat diganti lewat env (APIFY_ACTOR_X, APIFY_ACTOR_TIKTOK, ...), karena
// marketplace Apify sering berubah. Normalisasi output dibuat toleran terhadap berbagai skema.

export type ApifyPlatform = 'x' | 'tiktok' | 'instagram' | 'facebook' | 'threads';
const ACTORS: Record<ApifyPlatform, { env: string; def: string }> = {
  threads: { env: 'APIFY_ACTOR_THREADS', def: 'headply~threads-scraper' },
  x: { env: 'APIFY_ACTOR_X', def: 'apidojo~tweet-scraper' },
  tiktok: { env: 'APIFY_ACTOR_TIKTOK', def: 'clockworks~tiktok-scraper' },
  instagram: { env: 'APIFY_ACTOR_INSTAGRAM', def: 'apify~instagram-hashtag-scraper' },
  facebook: { env: 'APIFY_ACTOR_FACEBOOK', def: 'powerai~facebook-post-search-scraper' },
};

function apifyInput(platform: ApifyPlatform, q: TopicQuery, from: string, to: string, max: number) {
  const terms = primaryTerms(q, 3);
  switch (platform) {
    case 'x':
      return {
        searchTerms: terms.map((t) => `${t.includes(' ') ? `"${t}"` : t} since:${from.slice(0, 10)} until:${to.slice(0, 10)}`),
        maxItems: max,
        sort: 'Latest',
        tweetLanguage: 'in',
      };
    case 'tiktok':
      return { searchQueries: terms, resultsPerPage: Math.ceil(max / terms.length), searchSection: '/video' };
    case 'threads':
      return { searchQueries: terms, searchSort: 'recent', maxPostsPerQuery: Math.ceil(max / terms.length) };
    case 'instagram':
      return { hashtags: terms.map((t) => t.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()), resultsLimit: Math.ceil(max / terms.length) };
    case 'facebook':
      return { query: terms[0], searchQuery: terms[0], keyword: terms[0], maxResults: max, resultsLimit: max, recent_posts: true };
  }
}

const pick = (o: any, keys: string[]) => {
  for (const k of keys) {
    const v = k.split('.').reduce((acc, p) => (acc == null ? undefined : acc[p]), o);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

export function normalizeApify(platform: ApifyPlatform, rows: any[]): RawItem[] {
  const label = { x: 'X / Twitter', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads' }[platform];
  return rows
    .filter((r) => r && !r.noResults && !r.error)
    .map((r) => {
      const text = String(pick(r, ['full_text', 'fullText', 'text', 'caption', 'message', 'postText', 'description', 'title']) || '');
      const url = String(pick(r, ['url', 'twitterUrl', 'webVideoUrl', 'postUrl', 'link', 'permalink', 'shortCode']) || '');
      const author = pick(r, [
        'authorUsername', 'author.userName', 'author.username', 'author.name', 'authorMeta.name', 'ownerUsername', 'user.name',
        'user.screen_name', 'author', 'pageName', 'userName',
      ]);
      return {
        id: `${platform}_` + hashId(url || text),
        source: platform as SourceKey,
        channel: 'social' as const,
        outlet: label,
        domain: platform,
        url: url.startsWith('http') ? url : platform === 'instagram' && url ? `https://www.instagram.com/p/${url}/` : url,
        title: stripHtml(text).slice(0, 300),
        snippet: text.length > 300 ? stripHtml(text).slice(300, 800) : '',
        author: typeof author === 'string' ? author : undefined,
        publishedAt: toIso(pick(r, ['createdAt', 'created_at', 'createTimeISO', 'takenAtTimestamp', 'createTime', 'timestamp', 'time', 'date', 'publishedAt'])),
        image: pick(r, ['displayUrl', 'covers.default', 'videoMeta.coverUrl', 'thumbnail', 'image']),
        engagement: {
          views: num(pick(r, ['viewCount', 'playCount', 'videoViewCount', 'views'])),
          likes: num(pick(r, ['likeCount', 'favorite_count', 'diggCount', 'likesCount', 'likes', 'reactions_count', 'reactionsCount'])),
          comments: num(pick(r, ['replyCount', 'commentCount', 'commentsCount', 'comments_count', 'comments'])),
          shares: num(pick(r, ['retweetCount', 'repostCount', 'shareCount', 'shares', 'reshare_count', 'sharesCount'])),
        },
        kind: (platform === 'tiktok' ? 'video' : 'post') as RawItem['kind'],
      };
    })
    .filter((x) => x.title);
}

export async function apify(platform: ApifyPlatform, q: TopicQuery, from: string, to: string): Promise<RawItem[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN belum diisi');
  const actor = process.env[ACTORS[platform].env] || ACTORS[platform].def;
  const max = Number(process.env.APIFY_MAX_ITEMS || 60);
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&timeout=50&format=json&clean=true`;
  const rows = await fetchJson<any[]>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(apifyInput(platform, q, from, to, max)),
    timeoutMs: 56000,
  });
  return normalizeApify(platform, Array.isArray(rows) ? rows : []);
}

/* ------------------------- Komentar TikTok & Instagram (Apify) ------------------------- */
// Suara warganet paling jujur ada di kolom komentar. Setelah unggahan terkumpul, pipeline memanggil
// /api/collect { source, comments: [url unggahan] } untuk mengambil komentar dari unggahan teramai.
const COMMENT_ACTORS: Record<'tiktok' | 'instagram', { env: string; def: string }> = {
  tiktok: { env: 'APIFY_ACTOR_TIKTOK_COMMENTS', def: 'clockworks~tiktok-comments-scraper' },
  instagram: { env: 'APIFY_ACTOR_INSTAGRAM_COMMENTS', def: 'apify~instagram-comment-scraper' },
};

export const commentsEnabled = () => Boolean(process.env.APIFY_TOKEN) && process.env.APIFY_COMMENTS !== '0';

export function normalizeComments(platform: 'tiktok' | 'instagram', rows: any[], parents: { url: string; title: string }[]): RawItem[] {
  const label = platform === 'tiktok' ? 'TikTok (komentar)' : 'Instagram (komentar)';
  const parentOf = (u: string) => parents.find((p) => u && (u.startsWith(p.url) || p.url.startsWith(u.split('?')[0])));
  return rows
    .filter((r) => r && !r.error && !r.errorCode)
    .map((r) => {
      const text = stripHtml(String(pick(r, ['text', 'comment', 'body']) || ''));
      const postUrl = String(pick(r, ['videoWebUrl', 'postUrl', 'inputUrl', 'url']) || '');
      const parent = parentOf(postUrl);
      const cid = String(pick(r, ['cid', 'id', 'pk']) || hashId(text + postUrl));
      return {
        id: `${platform}c_` + hashId(cid + postUrl),
        source: platform as SourceKey,
        channel: 'social' as const,
        outlet: label,
        domain: platform,
        url: postUrl || parent?.url || '',
        title: text.slice(0, 300),
        snippet: parent ? `Komentar pada: ${parent.title.slice(0, 160)}` : 'Komentar',
        author: pick(r, ['uniqueId', 'ownerUsername', 'owner.username', 'username', 'user.uniqueId']),
        publishedAt: toIso(pick(r, ['createTimeISO', 'timestamp', 'createdAt', 'createTime', 'created_at'])),
        engagement: { likes: num(pick(r, ['diggCount', 'likesCount', 'likeCount'])), comments: num(pick(r, ['replyCommentTotal', 'repliesCount'])) },
        kind: 'comment' as const,
      };
    })
    .filter((x) => x.title);
}

export async function apifyComments(platform: 'tiktok' | 'instagram', parents: { url: string; title: string }[]): Promise<RawItem[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN belum diisi');
  const urls = parents.map((p) => p.url).filter((u) => /^https?:\/\//.test(u)).slice(0, 8);
  if (!urls.length) return [];
  const per = Number(process.env.APIFY_COMMENTS_PER_POST || 40);
  const actor = process.env[COMMENT_ACTORS[platform].env] || COMMENT_ACTORS[platform].def;
  const input = platform === 'tiktok' ? { postURLs: urls, commentsPerPost: per, maxRepliesPerComment: 0 } : { directUrls: urls, resultsLimit: per };
  const rows = await fetchJson<any[]>(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&timeout=50&format=json&clean=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    timeoutMs: 56000,
  });
  return normalizeComments(platform, Array.isArray(rows) ? rows : [], parents);
}
