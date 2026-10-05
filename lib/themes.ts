import type { ItemSprite, ThemeDef, ThemeId } from './types'

const ids: ThemeId[] = ['egypt', 'zombie', 'future', 'steampunk', 'medieval', 'deepsea']
const names = ['Tomb of the Sun King', 'Last Light Mall', 'Neon Singularity', 'The Brass Below', 'Ashen Crown', 'Abyssal Choir']
const keywords = ['egypt pharaoh mummy mummies tomb pyramid sun', 'zombie zombies mall undead outbreak horde', 'future robot robots space cyber neon alien', 'steampunk steam brass clockwork gear factory', 'medieval knight dragon castle dungeon sword', 'deepsea ocean sea underwater abyss submarine']
const colors = [
  ['#171322','#483044','#af7049','#f4d58d','#f9b233'],
  ['#101b18','#294437','#71834b','#d8dc9b','#ef6658'],
  ['#101024','#292855','#6555a1','#c4e7ee','#47ffcf'],
  ['#201b19','#493c35','#99734b','#ead2a3','#ff854a'],
  ['#171724','#36394d','#777b92','#dfd8c8','#be434d'],
  ['#081923','#15394b','#307889','#a1d9c4','#fa87b0'],
]
export const THEMES = Object.fromEntries(ids.map((id, i) => {
  const [bg, dark, mid, light, accent] = colors[i]!
  return [id, { id, name: names[i], blurb: ['Steal the last warmth of a dying sun.', 'Outrun the hunger behind the shutters.', 'Break the machine that owns tomorrow.', 'Silence the engine beneath the city.', 'Claim a crown that remembers its dead.', 'Bring a stolen voice back to the surface.'][i], keywords: keywords[i]!.split(' '), palette: { bg, dark, mid, light, accent } }]
})) as Record<ThemeId, ThemeDef>

export const vocabulary: Record<ThemeId, { place: string[]; treasure: string[]; foe: string[]; items: string[] }> = {
  egypt: { place: ['salt crypt', 'sunken pyramid', 'obsidian vault'], treasure: ['sun ember', 'golden heart', 'scarab seal'], foe: ['Tomb Guard', 'Stone Usher', 'Sun Archer', 'Scarab', 'Sun King'], items: ['Canopic Jar', 'Bronze Khopesh', 'Linen Ward', 'Sunfire Flask', 'Scarab Key', 'Golden Idol', 'Hourglass'] },
  zombie: { place: ['food court', 'sealed arcade', 'loading bay'], treasure: ['last vaccine', 'radio battery', 'rescue beacon'], foe: ['Shambler', 'Bloater', 'Spitter', 'Crawler', 'Patient Zero'], items: ['First Aid', 'Crowbar', 'Riot Vest', 'Pipe Bomb', 'Security Key', 'Lost Keepsake', 'Adrenaline'] },
  future: { place: ['memory bank', 'orbital prison', 'neon server'], treasure: ['human archive', 'stolen tomorrow', 'ghost protocol'], foe: ['Sentry', 'Titan Unit', 'Laser Drone', 'Microbot', 'Overmind'], items: ['Stim Pack', 'Plasma Edge', 'Mesh Shield', 'EMP Charge', 'Power Cell', 'Memory Shard', 'Clock Patch'] },
  steampunk: { place: ['boiler cathedral', 'brass foundry', 'clock tower'], treasure: ['perpetual spring', 'royal blueprint', 'iron lung'], foe: ['Automaton', 'Boiler Golem', 'Rivet Gunner', 'Cogling', 'Grand Engine'], items: ['Tonic', 'Gearblade', 'Brass Plate', 'Pressure Bomb', 'Winding Key', 'Silver Cog', 'Stolen Minute'] },
  medieval: { place: ['ash keep', 'forgotten abbey', 'thorn dungeon'], treasure: ['ashen crown', 'saint’s oath', 'last dragon egg'], foe: ['Hollow Knight', 'Ogre', 'Crossbowman', 'Rat', 'Cinder Lord'], items: ['Red Potion', 'Steel Sword', 'Chain Mail', 'Fire Pot', 'Iron Key', 'Royal Seal', 'Saint’s Sand'] },
  deepsea: { place: ['drowned chapel', 'coral station', 'black trench'], treasure: ['whale song', 'pearl engine', 'surface map'], foe: ['Drowned Diver', 'Crab Titan', 'Needle Eel', 'Fry', 'Abyssal Choir'], items: ['Kelp Salve', 'Harpoon', 'Dive Plate', 'Depth Charge', 'Hatch Key', 'Black Pearl', 'Air Reserve'] },
}
export const itemTypes: ItemSprite[] = ['heal', 'weapon', 'armor', 'bomb', 'key', 'relic', 'time']
export const descriptions = ['Restore 14 HP.', 'Permanently gain 2 attack.', 'Permanently gain 1 defense.', 'Deal 16 damage within 3 tiles.', 'Opens a chest or powered door automatically.', 'Worth 100 score.', 'Add 20 seconds to the doom clock.']
