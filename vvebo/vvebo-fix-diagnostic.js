/* VVebo timeline compatibility diagnostic. No UID, URL or response body is logged. */
(() => {
  const url = $request.url || '';
  const endpoint = new URL(url).pathname;
  const uidFrom = (value) => {
    try { return new URL(value).searchParams.get('uid'); } catch (_) { return null; }
  };
  const valid = (v) => typeof v === 'string' && /^\d+$/.test(v);
  const finish = (value) => $done(value || {});
  const note = (event, detail) => console.log(`[VVeboDiag] ${event}: ${detail}`);

  if (endpoint.endsWith('/remind/unread_count')) {
    const uid = uidFrom(url);
    if (valid(uid)) {
      $persistentStore.write(uid, 'vvebo_diag_uid');
      note('uid-cache', 'saved');
    } else note('uid-cache', 'missing');
    return finish();
  }

  if (endpoint.endsWith('/users/show')) {
    note('user-profile', valid(uidFrom(url)) ? 'uid-present' : 'uid-missing');
    return finish();
  }

  if (endpoint.endsWith('/statuses/user_timeline')) {
    const supplied = uidFrom(url);
    const cached = $persistentStore.read('vvebo_diag_uid');
    const uid = valid(supplied) ? supplied : valid(cached) ? cached : null;
    if (!uid) {
      note('timeline-request', 'uid-missing; original-request-preserved');
      return finish();
    }
    const newUrl = new URL(url);
    newUrl.pathname = newUrl.pathname.replace('/statuses/user_timeline', '/profile/statuses/tab');
    if (newUrl.searchParams.has('max_id')) {
      newUrl.searchParams.set('since_id', newUrl.searchParams.get('max_id'));
      newUrl.searchParams.delete('max_id');
    }
    newUrl.searchParams.set('containerid', `230413${uid}_-_WEIBO_SECOND_PROFILE_WEIBO`);
    note('timeline-request', `rewritten; uid-source=${valid(supplied) ? 'url' : 'cache'}`);
    return finish({url: newUrl.toString()});
  }

  if (endpoint.endsWith('/profile/statuses/tab')) {
    try {
      const data = JSON.parse($response.body);
      if (!Array.isArray(data.cards)) {
        note('timeline-response', `no-cards; response-preserved; result=${data.ok === 0 ? 'api-error' : 'unexpected-shape'}`);
        return finish();
      }
      const statuses = data.cards.flatMap(card => Array.isArray(card.card_group) ? card.card_group : [card])
        .filter(card => card && card.card_type === 9 && card.mblog)
        .map(card => card.mblog)
        .map(status => status.isTop ? {...status, label: '置顶'} : status);
      const sinceId = data.cardlistInfo && data.cardlistInfo.since_id;
      note('timeline-response', `cards=${data.cards.length}; statuses=${statuses.length}; page-token=${sinceId == null ? 'missing' : 'present'}`);
      return finish({body: JSON.stringify({statuses, since_id: sinceId || 0, total_number: 100})});
    } catch (error) {
      note('timeline-response', 'invalid-json-or-processing-error; response-preserved');
      return finish();
    }
  }
  return finish();
})();
