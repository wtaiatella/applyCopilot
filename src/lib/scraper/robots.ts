export async function checkRobotsTxt(searchUrl: string, userAgent: string): Promise<boolean> {
  try {
    const urlObj = new URL(searchUrl);
    const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
    
    const response = await fetch(robotsUrl, {
      headers: { "User-Agent": userAgent },
    });
    if (!response.ok) {
      // If robots.txt is not present (404) or fails to fetch, default to NOT blocked (false)
      return false;
    }

    const text = await response.text();
    const lines = text.split("\n");
    let activeUserAgent = false;
    let pathIsBlocked = false;

    for (const line of lines) {
      const cleanLine = line.trim().toLowerCase();
      if (cleanLine.startsWith("user-agent:")) {
        const uaValue = cleanLine.substring(11).trim();
        // Applies if wildcard '*' or matching our specific userAgent string
        activeUserAgent = (uaValue === "*" || userAgent.toLowerCase().includes(uaValue));
      } else if (activeUserAgent && cleanLine.startsWith("disallow:")) {
        const disallowPath = cleanLine.substring(9).trim();
        if (disallowPath) {
          // If Disallow matches the prefix of our target search path
          if (urlObj.pathname.startsWith(disallowPath)) {
            pathIsBlocked = true;
            break;
          }
        }
      } else if (activeUserAgent && cleanLine.startsWith("allow:")) {
        const allowPath = cleanLine.substring(6).trim();
        if (allowPath && urlObj.pathname.startsWith(allowPath)) {
          // Allow rules override disallow rules in standard robots.txt specs
          pathIsBlocked = false;
        }
      }
    }
    return pathIsBlocked;
  } catch (err) {
    console.error(`[Robots.txt Check] Error parsing robots.txt for ${searchUrl}:`, err);
    return false;
  }
}
