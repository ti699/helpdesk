import { supabase } from '@/integrations/supabase/client';

/**
 * Extract the storage path from a URL or return the path if it's already just a path
 */
function extractPath(urlOrPath: string): string {
  // If it's already just a path (no http), return as-is
  if (!urlOrPath.startsWith('http')) {
    return urlOrPath;
  }
  
  // Extract path from public URL format
  const publicMatch = urlOrPath.match(/\/storage\/v1\/object\/public\/attachments\/(.+)$/);
  if (publicMatch) {
    return decodeURIComponent(publicMatch[1]);
  }
  
  // Extract path from signed URL format
  const signedMatch = urlOrPath.match(/\/storage\/v1\/object\/sign\/attachments\/([^?]+)/);
  if (signedMatch) {
    return decodeURIComponent(signedMatch[1]);
  }
  
  // Fallback: assume the last part after 'attachments/' is the path
  const fallbackMatch = urlOrPath.match(/attachments\/(.+?)(?:\?|$)/);
  if (fallbackMatch) {
    return decodeURIComponent(fallbackMatch[1]);
  }
  
  return urlOrPath;
}

/**
 * Get a signed URL for a file in the attachments bucket
 * @param urlOrPath - Either a full URL or just the storage path
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 */
export async function getSignedUrl(urlOrPath: string, expiresIn = 3600): Promise<string | null> {
  if (!urlOrPath) return null;
  
  const path = extractPath(urlOrPath);
  
  const { data, error } = await supabase.storage
    .from('attachments')
    .createSignedUrl(path, expiresIn);
  
  if (error) {
    console.error('Error creating signed URL:', error);
    return null;
  }
  
  return data.signedUrl;
}

/**
 * Get signed URLs for multiple files
 * @param urlsOrPaths - Array of URLs or paths
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 */
export async function getSignedUrls(urlsOrPaths: string[], expiresIn = 3600): Promise<(string | null)[]> {
  if (!urlsOrPaths || urlsOrPaths.length === 0) return [];
  return Promise.all(urlsOrPaths.map(path => getSignedUrl(path, expiresIn)));
}
