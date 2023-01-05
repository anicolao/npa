export const messageCache: { [k: string]: any[] } = {
  game_event: [],
  game_diplomacy: [],
};

export function cacheEventResponseCallback(
  group: "game_event" | "game_diplomacy",
  resolve: (value: boolean | PromiseLike<boolean>) => void,
) {
  return (response: { report: { messages: any } }) => {
    let incoming = response.report.messages;
    if (messageCache[group].length > 0) {
      let overlapOffset = -1;
      for (let i = 0; i < incoming.length; ++i) {
        const message = incoming[i];
        if (message.key === messageCache[group][0].key) {
          overlapOffset = i;
          break;
        }
      }
      if (overlapOffset >= 0) {
        incoming = incoming.slice(0, overlapOffset);
      } else if (overlapOffset < 0) {
        const size = incoming.length * 2;
        console.log(`Missing some events, double fetch to ${size}`);
        requestRecentMessages(size, group);
        return;
      }
    }
    messageCache[group] = incoming.concat(messageCache[group]);
    resolve(true);
  };
}

export function requestRecentMessages(
  fetchSize: number,
  group: "game_event" | "game_diplomacy",
) {
  const ret = new Promise<boolean>((resolve, reject) => {
    jQuery.ajax({
      type: "POST",
      url: "/trequest/fetch_game_messages",
      async: true,
      data: {
        type: "fetch_game_messages",
        count: messageCache[group].length > 0 ? fetchSize : 100000,
        offset: 0,
        group,
        version: NeptunesPride.version,
        game_number: NeptunesPride.gameNumber,
      },
      success: cacheEventResponseCallback(group, resolve),
      error: reject,
      dataType: "json",
    });
  });
  return ret;
}

export function updateMessageCache(
  group: "game_event" | "game_diplomacy",
): Promise<boolean> {
  return requestRecentMessages(4, group);
}
