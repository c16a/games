import type { SceneFamily, SceneTemplate } from "./types";

type TemplateSeed = [title: string, activity: string, interest: string, clearText: string, wetText: string];

const OPENINGS: Record<SceneFamily, string[]> = {
  arrival: ["A new street opens ahead.", "The first sounds of town drift closer.", "A hand-painted sign welcomes travellers."],
  everyday: ["The morning begins without a hurry.", "Small routines give the day its shape.", "The town is already awake."],
  food: ["A delicious smell crosses the square.", "Lunch chatter spills through an open doorway.", "A chalkboard menu catches Mira's eye."],
  rest: ["Today invites a gentler pace.", "A peaceful corner appears at just the right time.", "The afternoon feels made for breathing slowly."],
  work: ["A neighbour could use another pair of hands.", "A small community job is waiting.", "Someone is preparing for a busy afternoon."],
  friendship: ["A familiar wave comes from across the street.", "A conversation begins with an easy smile.", "Someone remembers Mira from an earlier day."],
  arts: ["Colour and music brighten the lane.", "A handmade poster promises something creative.", "An open door reveals a room full of ideas."],
  astronomy: ["Mira notices the sky before anything else.", "A constellation sketch peeks from a noticeboard.", "Tonight's sky has everyone talking."],
  nature: ["The path beyond the houses looks inviting.", "Birdsong marks the edge of town.", "The landscape changes with every few steps."],
  festival: ["Bunting appears between the rooftops.", "The square hums with preparations.", "A local celebration is taking shape."],
};

const SEEDS: Record<SceneFamily, TemplateSeed[]> = {
  arrival: [
    ["A Map in the Window", "trace a friendly walking route", "maps", "Sunlight picks out a map of tiny lanes and gardens in the station window.", "Raindrops turn the station map into a sparkling puzzle of lanes and gardens."],
    ["The Welcome Bell", "learn the town's welcome tradition", "stories", "A brass bell rings as the market opens for the day.", "The market bell rings under a striped awning while everyone shelters and chats."],
    ["Postcards at the Quay", "choose a postcard for the journal", "drawing", "Postcards show boats, rooftops, and the wide blue horizon.", "Postcards show the harbour in every kind of weather, including today's silver rain."],
    ["The Helpful Conductor", "ask about nearby routes", "trains", "A conductor marks three possible day trips on Mira's folded map.", "Inside the dry waiting room, a conductor marks three possible day trips on Mira's map."],
    ["A Town's First Song", "listen to a street musician", "music", "A violin melody guides Mira toward the centre of town.", "A violin melody floats from a covered arcade toward the centre of town."],
    ["The Blue Door", "visit the community welcome room", "people", "The blue door of the welcome room stands open beside a pot of daisies.", "The blue door promises warm light, dry chairs, and a pot of rain-bright daisies."],
  ],
  everyday: [
    ["Morning Noticeboard", "browse today's local notices", "community", "Fresh notices advertise clubs, walks, and a missing red scarf.", "The library noticeboard is busy with indoor clubs and offers of spare umbrellas."],
    ["Laundry-Line Stories", "chat while helping fold linen", "stories", "Bright sheets billow above a courtyard full of neighbourly gossip.", "Neighbours fold dry linen indoors and trade funny stories about sudden showers."],
    ["The Little Repair Shop", "watch a patient repair", "craft", "A clockmaker works with the door open and explains each tiny gear.", "Warm lamplight fills a repair shop where a clockmaker explains each tiny gear."],
    ["Market Morning", "compare the market stalls", "food", "Farmers arrange berries, bread, and flowers in cheerful rows.", "Canvas roofs drum softly above stalls of bread, preserves, and late flowers."],
    ["A Library Window Seat", "read a chapter by the window", "reading", "The library window overlooks bicycles gliding through the square.", "Rain makes the library window seat especially cosy, with a stack of new books nearby."],
    ["Tea at Four", "join the town's afternoon pause", "customs", "At four, shopkeepers carry cups outside and greet whoever passes.", "At four, shopkeepers gather under the arcade with tea and stories."],
  ],
  food: [
    ["Soup with a Story", "try the cook's vegetable soup", "food", "The café cook serves a bright garden soup and tells where each herb grew.", "Steam curls from a hearty soup while the cook tells how rainy days improve the herbs."],
    ["The Baker's New Loaf", "taste a local bread", "baking", "A baker offers slices of a loaf shaped like the nearby hills.", "The bakery windows fog as a hill-shaped loaf comes warm from the oven."],
    ["Picnic Recipe Swap", "share an easy picnic idea", "cooking", "Families trade picnic recipes beneath the park's chestnut trees.", "Families shelter in the hall and trade recipes for the next sunny picnic."],
    ["Harbour Noodles", "eat beside the working quay", "boats", "A tiny stall serves noodles while ferries cross the sparkling water.", "A tiny covered stall serves warming noodles beside rain-polished boats."],
    ["Orchard Tasting", "sample the region's apples", "nature", "An orchard table holds apples ranging from honey-sweet to wonderfully sharp.", "Inside the orchard barn, apple slices and warm cider brighten the grey afternoon."],
    ["The Shared Table", "join a welcoming community lunch", "people", "A long courtyard table has one cheerful empty chair.", "A long table in the community kitchen has one cheerful empty chair."],
  ],
  rest: [
    ["Bench Beneath the Linden", "take a quiet, unhurried rest", "nature", "A wide linden tree shades a bench beside the fountain.", "A sheltered garden seat offers the sound of rain on broad linden leaves."],
    ["The Cosy Reading Room", "rest with a short book", "reading", "The reading room is quiet except for turning pages and distant birds.", "The reading room glows warmly while rain whispers against the glass."],
    ["Letters from Home", "write and read a letter", "home", "A sunny writing desk makes room for memories and new stories.", "A quiet desk by the radiator is perfect for a thoughtful letter home."],
    ["Slow Sketching", "draw without trying to finish", "drawing", "Mira sketches rooflines while clouds travel lazily overhead.", "Mira sketches umbrellas and reflections from a dry café window."],
    ["A Hammock Afternoon", "rest in the community garden", "gardening", "Two sturdy trees hold a hammock above the herb garden.", "The garden shed has a safe canvas daybed and the soothing scent of herbs."],
    ["Listening Hour", "enjoy a peaceful local radio show", "music", "A gentle radio programme plays beside an open window.", "The rain and a gentle radio programme make a perfect quiet duet."],
  ],
  work: [
    ["Library Helpers", "sort returned picture books", "reading", "The librarian needs help returning colourful books to their shelves.", "The busy library needs help drying book covers and sorting returns."],
    ["Garden Watering", "water the community vegetable beds", "gardening", "The community garden's thirsty seedlings need a careful watering.", "The greenhouse seedlings need labels and a little careful watering."],
    ["Festival Posters", "hang cheerful event posters", "art", "Fresh festival posters need placing along the sunny high street.", "Festival posters need arranging inside shops where they will stay dry."],
    ["Museum Labels", "match labels to curious objects", "history", "A small museum is preparing a table of local treasures.", "The museum is extra busy and needs help matching labels to local treasures."],
    ["Boat-Shed Inventory", "count lifejackets and ropes", "boats", "The sailing club is checking its bright rows of safety gear.", "Inside the boat shed, the club is checking dry ropes and safety gear."],
    ["Seed-Packet Morning", "pack seeds for neighbourhood gardens", "gardening", "Volunteers fill envelopes with seeds for balconies across town.", "At a long indoor table, volunteers pack seeds for brighter days."],
  ],
  friendship: [
    ["A Shared Umbrella", "walk and trade travel stories", "stories", "A friendly local offers shade beneath a bright parasol.", "A friendly local offers room beneath a sunflower-yellow umbrella."],
    ["The Favourite View", "visit a friend's favourite lookout", "nature", "A new friend knows a quiet view across tiled rooftops.", "A new friend shares a covered tower window overlooking rain-softened rooftops."],
    ["Recipe Notebook", "swap a favourite snack recipe", "cooking", "Two notebooks open side by side at an outdoor table.", "Two recipe notebooks open beside warm mugs in the community kitchen."],
    ["A Friendly Rematch", "play a quick board game", "games", "A shaded park table is ready for a friendly puzzle game.", "The youth club has a free table and a well-loved strategy game."],
    ["Stories on the Steps", "listen to a childhood memory", "stories", "The museum steps become a place for stories and laughter.", "Wide library steps indoors become a place for stories and laughter."],
    ["The Next Postcard", "promise to send a future postcard", "letters", "A friend points out the funniest postcard in the rack.", "A friend finds a postcard showing this exact square in the rain."],
  ],
  arts: [
    ["Open Studio", "join a relaxed drawing table", "drawing", "An artist has set out pencils beside bowls of summer fruit.", "An artist invites everyone to sketch the reflections in the wet street."],
    ["Courtyard Cinema", "watch a hopeful short film", "movies", "Cushions and a small screen wait in a lantern-lit courtyard.", "The community cinema moves indoors, where cushions and warm lights wait."],
    ["Music from Found Things", "make rhythms with everyday objects", "music", "A musician turns shells, tins, and pebbles into a playful orchestra.", "A musician turns jars, spoons, and the rain itself into an orchestra."],
    ["Theatre in a Suitcase", "help with a tiny travelling play", "theatre", "A performer unfolds a whole stage from one battered suitcase.", "A performer unfolds a miniature stage in the station waiting room."],
    ["Mosaic Afternoon", "place a tile in a community picture", "craft", "Neighbours are building a blue-and-gold mosaic beside the square.", "Neighbours sort blue-and-gold mosaic pieces inside the arts hall."],
    ["Dance Steps", "learn a simple local dance", "dance", "A caller teaches three easy steps beneath strings of flags.", "A caller teaches three easy steps in the bright town hall."],
  ],
  astronomy: [
    ["The Star Club", "meet the local astronomy club", "astronomy", "Club members prepare small telescopes for a clear evening.", "Clouds move the star club indoors for sky maps, cocoa, and stories."],
    ["Planetarium Postcard", "visit a pocket-sized planetarium", "astronomy", "The planetarium offers a cool, starry break from the bright afternoon.", "The planetarium dome promises a perfectly clear sky indoors."],
    ["Moonrise Timetable", "learn when the moon will rise", "astronomy", "A chalkboard lists tonight's moonrise beside a sketch of the horizon.", "A café chalkboard explains moonrise even though clouds hide tonight's view."],
    ["Observatory Hill", "tour the hilltop observatory", "astronomy", "The observatory roof is open and its guide points toward the evening sky.", "The observatory guide demonstrates its instruments and a live weather display indoors."],
    ["Constellation Quilt", "help name shapes in a star quilt", "astronomy", "A quilt group spreads star patterns across a sunny lawn.", "A quilt group fills the hall with bright constellations stitched in cloth."],
    ["Messages from Space", "listen to recorded signals and stories", "science", "A science van plays recordings inspired by planets and distant probes.", "A science van becomes a cosy listening room for stories from distant probes."],
  ],
  nature: [
    ["River Path", "follow the easy riverside loop", "nature", "Dragonflies hover along an easy path beside the bright river.", "A covered riverside hide offers a safe view of ripples, ducks, and rain."],
    ["Hill of Wild Thyme", "walk among fragrant hillside plants", "walking", "A gentle hill path smells of thyme warmed by the sun.", "A nature centre brings hillside herbs indoors for a fragrant workshop."],
    ["Tide-Pool Guide", "meet the tiny creatures of the shore", "sea", "Low tide reveals pools full of darting, shining life.", "The marine centre's touch-free tanks reveal the life usually found in tide pools."],
    ["Birdsong Map", "mark the calls heard nearby", "birds", "A guide helps map whistles and chirps around the park.", "From a sheltered hide, a guide helps identify birds enjoying the rain."],
    ["The Old Orchard", "wander beneath old fruit trees", "gardening", "Old apple trees make cool green rooms along the path.", "The orchard barn displays pressed leaves and stories from every season."],
    ["Lantern Walk", "take a short twilight nature walk", "walking", "Soft lanterns mark an easy path as evening settles.", "A covered botanical walkway glows with lanterns and rain-bright leaves."],
  ],
  festival: [
    ["Paper Lantern Day", "make a lantern for the square", "craft", "Tables of coloured paper fill the square before sunset.", "Lantern-makers gather in the hall while rain makes the colours glow."],
    ["The Long Picnic", "join a town-wide shared meal", "food", "Tables stretch from the fountain to the old clock tower.", "The long picnic winds through the covered market with music at both ends."],
    ["River Music Evening", "hear bands from neighbouring towns", "music", "Small stages face the river as musicians begin to tune.", "Bands take turns beneath the market roof while rain keeps the rhythm."],
    ["Story Flags", "add a travel memory to the bunting", "stories", "Every flag above the lane carries one tiny local story.", "Inside the hall, people paint story flags for the next clear day."],
    ["Kite Morning", "decorate a kite with local symbols", "craft", "A steady breeze lifts bright kites over the common.", "Kite-makers decorate sails indoors and test tiny models with fans."],
    ["Night of Windows", "follow glowing window displays", "art", "At dusk, families turn their front windows into tiny theatres.", "Rain doubles every glowing window display in the shining pavement."],
  ],
};

export const SCENE_TEMPLATES: SceneTemplate[] = (Object.entries(SEEDS) as [SceneFamily, TemplateSeed[]][])
  .flatMap(([family, entries]) => entries.map(([title, activity, interest, clearText, wetText], index) => ({
    id: `${family}-${index + 1}`,
    family,
    title,
    openings: OPENINGS[family],
    clearText,
    wetText,
    activity,
    interest,
  })));

export const SCENE_FAMILIES = Object.keys(SEEDS) as SceneFamily[];
