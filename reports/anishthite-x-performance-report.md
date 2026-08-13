# @anishthite X performance report

**Snapshot:** 2026-08-13 UTC
**Purpose:** identify the post and reply patterns that have earned the strongest public engagement, and the patterns that have not.

## Scope and reliability

This is an analysis of **101 publicly available profile entries**: 80 original posts and 21 replies, dated from February 2023 through July 2026. The collection was parsed from X's unauthenticated profile-syndication response, which provides post text, timestamps, media metadata, and public likes, reposts, quotes, and replies. The profile metadata returned with that response reports `statuses_count: 4,332`.

This is **not a complete archival export** of all 4,332 posts/replies. The public syndication response exposes a limited, non-chronological selection and does not paginate from the endpoint. I also checked public mirrors, but they were either blocked or did not provide a usable history. The findings therefore describe the verifiable public sample—not every post ever made—and should be treated as directional rather than causal.

For a complete historical analysis, export the account data from X or authorize an API/archive provider, then rerun the same breakdown over the full set. The official X API's user-post timeline supports pagination and up to 3,200 recent posts, subject to its required authentication and access level.

## Executive takeaways

- **Demonstrated product magic wins.** In this sample, original posts with media earned a median **49 likes** and **55 total public interactions**, versus **30** and **36** for text-only originals. This is association, not proof of causation: the strongest media posts also tended to have the clearest hooks.
- The best posts combine a **relatable premise**, a **specific capability**, and a **visible result**. “Look what I made” works much better when the viewer instantly understands why it is surprising or useful.
- **Concrete, copyable instructions travel.** A three-step recipe for making attractive websites was the sample's second-highest-like post.
- **Asks invite conversation.** Community-oriented prompts generated the sample's two largest reply counts among originals (689 and 270), even when they did not lead in reposts.
- **Replies are a distribution lever, not a default reach engine.** Replies averaged fewer likes than originals (76 vs. 122), but technical proof or a highly relevant response to a large conversation can break out.
- Generic captions, feature announcements without a visible payoff, and context-light images were the weakest recurring pattern. Media alone is not enough.

## Sample-level metrics

| Group | Posts | Median likes | Mean likes | Median public interactions* | Mean public interactions* |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original posts | 80 | 36.5 | 121.5 | 44 | 151.9 |
| Replies | 21 | 32 | 75.6 | 37 | 93.6 |
| Original posts with media | 61 | 49 | 145.5 | 55 | 178.2 |
| Text-only original posts | 19 | 30 | 44.7 | 36 | 67.7 |

\*Public interactions = likes + reposts + quotes + replies. View counts were not consistently available and are not included.

The mean is pulled up by a handful of breakouts: the top three original posts account for **44% of likes** and **45% of public interactions** among original posts in the sample. Median values are therefore the better description of a typical post.

## What performed well

| Pattern | Example | Public result | Why it likely resonated |
| --- | --- | ---: | --- |
| Relatable problem + playful interactive demo | [“angel and devil on my shoulder”](https://x.com/anishthite/status/1804637976372326506) | 1,745 likes, 95 reposts, 48 quotes, 689 replies | A universal decision-making frustration becomes a surprising thing people can try and discuss. |
| Short, actionable recipe | [“The easiest way to get the nicest websites”](https://x.com/anishthite/status/1877824268966482146) | 1,702 likes, 127 reposts, 22 replies | It gives a compact workflow that readers can immediately copy; the product mention is embedded in utility rather than leading with an announcement. |
| Familiar audience/problem + product payoff | [AskMKBHD](https://x.com/anishthite/status/1785846442634162223) | 843 likes, 29 reposts, 65 quotes, 67 replies | A recognizable creator and a clear shopping problem make the demo legible beyond a niche builder audience. |
| Technical milestone with proof | [LLaMA on a Pixel 6](https://x.com/anishthite/status/1635678053853536256) | 512 likes, 96 reposts, 48 quotes | It makes a concrete, impressive claim with a visible artifact and credits a relevant collaborator. |
| Clear launch with a tangible before/after | [Build-a-Site](https://x.com/anishthite/status/1816922149485158692) | 338 likes, 16 reposts, 43 replies | It states an outcome (“full websites in seconds”), names the enabling model, and shows a result. |
| Audience invitation | [“drop your idea slide below”](https://x.com/anishthite/status/1804354313118191692) | 234 likes, 270 replies | The ask is specific, offers real value, and is directed at an existing community. |
| Product feedback question | [Tom Riddle’s diary](https://x.com/anishthite/status/1821257370774679868) | 173 likes, 20 replies | The concept is vivid and the prompt asks people to improve something they can understand. |

### High-performing replies

Replies most clearly outperformed when they added a demo, technical proof, or a substantive point to a conversation with an already-relevant audience:

- [LLaMA on a Pixel 6 reply](https://x.com/anishthite/status/1635188333705043969): 514 likes, 82 reposts, and 65 quotes.
- [AskMKBHD response to MKBHD](https://x.com/anishthite/status/1786131460740825562): 364 likes and 49 replies. It gives context and stakes rather than a one-line reaction.
- [Response in a conversation about online in-groups](https://x.com/anishthite/status/1786833201765425281): only 24 likes, but 76 replies and 9 quotes—evidence that a reply can be useful for conversation even when it is not broadly liked.

## What did not perform well

The following are low-performing within this particular sample; they are not judgments on the products or ideas themselves.

| Pattern | Example | Public result | Likely issue to test |
| --- | --- | ---: | --- |
| Vague feature announcement | [Sitebrew dark mode](https://x.com/anishthite/status/1902389841045942787) | 22 likes, 1 reply | “Dark mode” is a familiar feature, but the post does not show why this implementation changes a user’s experience. |
| Generic product positioning | [“The best no-code UX is plain english”](https://x.com/anishthite/status/1837984175418384770) | 22 likes, 2 reposts | The claim is broad; it lacks a concrete output, surprising constraint, or story. |
| Context-light status update | [“small vibe update”](https://x.com/anishthite/status/1912680157456027664) | 29 likes, 1 reply | Existing followers may understand it, but a new viewer has little reason to stop or share. |
| Media with almost no explanatory hook | [“🫡”](https://x.com/anishthite/status/1899169382984565192) | 22 likes, 2 replies | The image must carry all the context, limiting interpretation and shareability. |
| Bare milestone / implementation diary | [“7309 line change kinda weekend”](https://x.com/anishthite/status/1767035319000711637) | 19 likes, 4 replies | It signals effort, not a user-visible outcome. Reframe around what the change enables. |
| Recent social-graph visualization post | [Curius graph](https://x.com/anishthite/status/2082518393576722670) | 7 likes, 2 reposts, 1 reply | The idea may be interesting, but the hook does not say what surprising discovery the viewer gets. Its recency also makes it a weak comparison with mature posts. |

The contrast is especially useful for launch posts: [Build-a-Site](https://x.com/anishthite/status/1816922149485158692), [AskMKBHD](https://x.com/anishthite/status/1785846442634162223), and the [YC interview simulator](https://x.com/anishthite/status/1832905181278941610) all make a clear promise and show a concrete outcome. “Dark mode,” “small vibe update,” and general no-code positioning announce rather than demonstrate.

## Recommended posting system

Use this as the default structure for product posts:

1. **Lead with the human tension or surprising claim.** Start with the thing a non-follower can understand: a frustrating task, a cultural reference, a visual surprise, or a measurable change.
2. **Show the proof immediately.** Native video, GIF, or an annotated before/after should demonstrate the claim without requiring a click.
3. **Name the mechanism in one sentence.** Explain what was built and how, in plain language. Credit collaborators when it adds context.
4. **Choose one call to action.** Ask for a remix, feedback on one specific decision, a reply with an idea, or a try-it link—not all four.
5. **Put the product link after the payoff.** Test placing the direct link in a self-reply when the lead post has a strong native demo; compare repost and reply rate against link-in-body posts.

For replies, be selective: respond where Anish can add a working example, a technical observation, or a sharp question. “Looks sick” style replies build relationships but should not be expected to create broad reach.

## Four experiments to run next

| Experiment | Version A | Version B | Success measure |
| --- | --- | --- | --- |
| Launch hook | “We shipped [feature]” | A user problem + surprising result, then feature name | Reposts + quotes per 1,000 views |
| Demo framing | Screen recording with generic caption | Same recording with outcome labeled in first line/frame | 3-second video retention and likes per 1,000 views |
| CTA | “Try it” | One narrowly scoped question (“what should I add next?”) | Replies per 1,000 views and reply quality |
| Link placement | Link in the body | Link in first self-reply | Reposts, replies, and outbound clicks |

Keep a small post log with post URL, format, topic, media type, CTA, 24-hour views, and each public interaction type. After 20–30 consistently tagged posts, compare medians by format; that will produce much stronger guidance than this limited public sample.

## Source notes

- Primary collection: [X profile syndication response for @anishthite](https://syndication.twitter.com/srv/timeline-profile/screen-name/anishthite), retrieved 2026-08-13. It contains the public fields used above.
- The endpoint is designed for embedded profile timelines and exposes data in the page’s server-rendered `__NEXT_DATA__`; it has documented limits on the number of accessible profile posts and incomplete reply coverage. [Method reference](https://alokbishoyi.com/blogposts/free-twitter-api-for-ai-agents.html)
- A complete collection requires authorized access or an account archive. X documents its user-post timeline endpoint, pagination, and access requirements here: [X API timelines](https://docs.x.com/x-api/posts/timelines/introduction).
