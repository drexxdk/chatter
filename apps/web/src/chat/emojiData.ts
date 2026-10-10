// The emoji the picker offers, in sections, each with words to search for (English only).
export type EmojiSection =
  "smileys" | "gestures" | "symbols" | "nature" | "food" | "activities";

export interface EmojiEntry {
  emoji: string;
  words: string;
}

const parse = (data: string): EmojiEntry[] =>
  data.split("|").map((item) => {
    const space = item.indexOf(" ");
    return { emoji: item.slice(0, space), words: item.slice(space + 1) };
  });

export const EMOJI_SECTIONS: { id: EmojiSection; emojis: EmojiEntry[] }[] = [
  {
    id: "smileys",
    emojis: parse(
      "😀 grinning happy|😃 smile happy|😄 smile laugh|😁 grin|😆 laugh|😅 sweat laugh nervous|🤣 rofl lol laugh|😂 joy tears laugh|🙂 smile|🙃 upside down|😉 wink|😊 blush smile|😇 angel halo|🥰 love adore|😍 heart eyes love|🤩 star struck wow|😘 kiss|😋 yum tasty|😛 tongue|😜 wink tongue silly|🤪 crazy zany|😝 tongue silly|🤑 money|🤗 hug|🤭 oops giggle|🤫 shh quiet secret|🤔 think hmm|🤐 zipper mouth secret|🤨 skeptical eyebrow|😐 neutral|😑 expressionless|😶 silent|😏 smirk|😒 unamused|🙄 eye roll|😬 grimace awkward|😌 relieved|😔 sad pensive|😪 sleepy|🤤 drool|😴 sleep zzz|😷 mask sick|🤒 sick thermometer|🤕 hurt bandage|🤢 nauseated sick|🤮 vomit|🥵 hot|🥶 cold freezing|🥴 woozy drunk|😵 dizzy|🤯 mind blown|🤠 cowboy|🥳 party celebrate|😎 cool sunglasses|🤓 nerd|🧐 monocle|😕 confused|😟 worried|🙁 frown|😮 wow surprised|😲 astonished|😳 flushed embarrassed|🥺 pleading puppy|😨 fear scared|😰 anxious|😥 sad relieved|😢 cry sad|😭 sob crying|😱 scream shock|😖 confounded|😞 disappointed|😓 sweat|😩 weary|😫 tired|🥱 yawn|😤 triumph angry|😡 angry mad|😠 angry|🤬 swearing cursing|😈 devil imp|💀 skull dead|💩 poop|🤡 clown|👻 ghost|👽 alien|🤖 robot",
    ),
  },
  {
    id: "gestures",
    emojis: parse(
      "👍 thumbs up like yes|👎 thumbs down dislike no|👌 ok perfect|✌️ victory peace|🤞 fingers crossed luck|🤟 love you|🤘 rock horns|🤙 call me shaka|👈 left point|👉 right point|👆 up point|👇 down point|☝️ point up|✋ hand stop high five|🤚 raised back hand|🖐️ hand fingers splayed|🖖 vulcan spock|👋 wave hello bye|👏 clap applause|🙌 raised hands hooray|👐 open hands|🤲 palms up|🤝 handshake deal|🙏 pray thanks please|✍️ writing|💅 nail polish|💪 muscle strong flex|👀 eyes look|🧠 brain|🤷 shrug|🤦 facepalm|🙋 raise hand|🙆 ok gesture|🙅 no gesture|🙇 bow|💃 dance|🕺 dance|🏃 run",
    ),
  },
  {
    id: "symbols",
    emojis: parse(
      "❤️ red heart love|🧡 orange heart|💛 yellow heart|💚 green heart|💙 blue heart|💜 purple heart|🖤 black heart|🤍 white heart|🤎 brown heart|💔 broken heart|💕 two hearts|💞 revolving hearts|💓 beating heart|💗 growing heart|💖 sparkling heart|💘 heart arrow cupid|💝 heart gift|💯 hundred perfect|💢 anger|💥 boom collision|💫 dizzy star|💦 sweat drops water|💨 dash wind|💤 zzz sleep|✨ sparkles|⭐ star|🌟 glowing star|⚡ lightning bolt|🔥 fire hot lit|✅ check yes done|❌ cross no wrong|❓ question|❗ exclamation|⚠️ warning|🚫 prohibited|➕ plus|➖ minus|♻️ recycle|🎵 music note|🎶 music notes",
    ),
  },
  {
    id: "nature",
    emojis: parse(
      "🐶 dog|🐱 cat|🐭 mouse|🐹 hamster|🐰 rabbit bunny|🦊 fox|🐻 bear|🐼 panda|🐨 koala|🐯 tiger|🦁 lion|🐮 cow|🐷 pig|🐸 frog|🐵 monkey|🙈 see no evil monkey|🙉 hear no evil monkey|🙊 speak no evil monkey|🐔 chicken|🐧 penguin|🐦 bird|🦆 duck|🦉 owl|🐴 horse|🦄 unicorn|🐝 bee|🦋 butterfly|🐢 turtle|🐍 snake|🐙 octopus|🐬 dolphin|🐳 whale|🦈 shark|🌸 cherry blossom flower|🌹 rose flower|🌻 sunflower|🌲 tree|🌴 palm tree|🍀 clover luck|🌈 rainbow|☀️ sun|🌙 moon|☁️ cloud|🌧️ rain|❄️ snow snowflake|🌊 wave ocean|🌍 earth world",
    ),
  },
  {
    id: "food",
    emojis: parse(
      "🍎 apple|🍌 banana|🍉 watermelon|🍓 strawberry|🍒 cherries|🍑 peach|🍍 pineapple|🥑 avocado|🍅 tomato|🥕 carrot|🌽 corn|🥔 potato|🍞 bread|🧀 cheese|🥚 egg|🥓 bacon|🍔 burger hamburger|🍟 fries|🍕 pizza|🌭 hot dog|🌮 taco|🍝 pasta spaghetti|🍣 sushi|🍜 ramen noodles|🍩 donut|🍪 cookie|🎂 cake birthday|🍰 cake|🍫 chocolate|🍬 candy|🍿 popcorn|☕ coffee|🍵 tea|🍺 beer|🍻 cheers beers|🍷 wine|🥂 champagne cheers|🍸 cocktail|🥤 soda drink",
    ),
  },
  {
    id: "activities",
    emojis: parse(
      "⚽ soccer football|🏀 basketball|🏈 american football|⚾ baseball|🎾 tennis|🏐 volleyball|🎱 pool billiards|🏓 ping pong|🎯 dart target|🎮 video game controller|🎲 dice|🎸 guitar|🎹 piano|🥁 drum|🎤 microphone sing|🎧 headphones|🎬 movie clapper|🎨 art palette|🏆 trophy win|🥇 gold medal first|🎉 party popper tada|🎊 confetti|🎁 gift present|🎈 balloon|🚀 rocket|✈️ airplane plane|🚗 car|🚲 bicycle bike|🏠 house home|💻 laptop computer|📱 phone mobile|💡 idea light bulb|📷 camera|📚 books|✏️ pencil|📌 pin|🔒 lock|🔑 key|💰 money bag|💎 gem diamond|⌚ watch|⏰ alarm clock|🛒 cart shopping|🧹 broom|🔔 bell",
    ),
  },
];

// Every emoji one of whose words starts with each of the words typed.
export function searchEmoji(query: string): EmojiEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const seen = new Set<string>();

  return EMOJI_SECTIONS.flatMap((section) => section.emojis).filter((entry) => {
    if (seen.has(entry.emoji)) return false;

    const words = entry.words.split(" ");
    const match = terms.every((term) =>
      words.some((word) => word.startsWith(term)),
    );
    if (match) seen.add(entry.emoji);

    return match;
  });
}
