import type { ItemInfo } from "./armory";
import type { ItemInfoSource } from "./ItemInfoSource";

// Fixture item data for the dummy armory gear (DummyArmoryRepository), captured from Wowhead's
// WotLK tooltip API. Local development with DATA_SOURCE=dummy makes no item requests; the icons
// themselves still load from Wowhead's CDN in the browser.
const DUMMY_ITEMS: Record<number, Omit<ItemInfo, "itemId">> = {
  51543: { name: "Wrathful Gladiator's Plate Helm", quality: 4, itemLevel: 270, icon: "inv_helmet_98", twoHanded: false },
  51355: { name: "Wrathful Gladiator's Pendant of Triumph", quality: 4, itemLevel: 264, icon: "inv_jewelry_necklace_36", twoHanded: false },
  51545: { name: "Wrathful Gladiator's Plate Shoulders", quality: 4, itemLevel: 270, icon: "inv_shoulder_132", twoHanded: false },
  51541: { name: "Wrathful Gladiator's Plate Chestpiece", quality: 4, itemLevel: 270, icon: "inv_chest_leather_24", twoHanded: false },
  51362: { name: "Wrathful Gladiator's Girdle of Triumph", quality: 4, itemLevel: 264, icon: "inv_belt_48c", twoHanded: false },
  51544: { name: "Wrathful Gladiator's Plate Legguards", quality: 4, itemLevel: 270, icon: "inv_pants_plate_27", twoHanded: false },
  51363: { name: "Wrathful Gladiator's Greaves of Triumph", quality: 4, itemLevel: 264, icon: "inv_boots_plate_12", twoHanded: false },
  51364: { name: "Wrathful Gladiator's Bracers of Triumph", quality: 4, itemLevel: 264, icon: "inv_bracer_17", twoHanded: false },
  51542: { name: "Wrathful Gladiator's Plate Gauntlets", quality: 4, itemLevel: 270, icon: "inv_gauntlets_62", twoHanded: false },
  51354: { name: "Wrathful Gladiator's Cloak of Triumph", quality: 4, itemLevel: 264, icon: "inv_misc_cape_18", twoHanded: false },
  51358: { name: "Wrathful Gladiator's Band of Triumph", quality: 4, itemLevel: 264, icon: "inv_jewelry_ring_60", twoHanded: false },
  50402: { name: "Ashen Band of Endless Vengeance", quality: 4, itemLevel: 277, icon: "inv_jewelry_ring_81", twoHanded: false },
  51378: { name: "Medallion of the Horde", quality: 4, itemLevel: 264, icon: "inv_jewelry_trinketpvp_02", twoHanded: false },
  50363: { name: "Deathbringer's Will", quality: 4, itemLevel: 277, icon: "inv_jewelry_trinket_04", twoHanded: false },
  51392: { name: "Wrathful Gladiator's Greatsword", quality: 4, itemLevel: 264, icon: "inv_sword_157", twoHanded: true },
  51499: { name: "Wrathful Gladiator's Ringmail Helm", quality: 4, itemLevel: 270, icon: "inv_helmet_160", twoHanded: false },
  51357: { name: "Wrathful Gladiator's Pendant of Victory", quality: 4, itemLevel: 264, icon: "inv_jewelry_necklace_36", twoHanded: false },
  51502: { name: "Wrathful Gladiator's Ringmail Spaulders", quality: 4, itemLevel: 270, icon: "inv_shoulder_47", twoHanded: false },
  51497: { name: "Wrathful Gladiator's Ringmail Armor", quality: 4, itemLevel: 270, icon: "inv_chest_mail_02", twoHanded: false },
  51350: { name: "Wrathful Gladiator's Waistguard of Triumph", quality: 4, itemLevel: 264, icon: "inv_belt_72", twoHanded: false },
  51500: { name: "Wrathful Gladiator's Ringmail Leggings", quality: 4, itemLevel: 270, icon: "inv_pants_mail_33", twoHanded: false },
  51351: { name: "Wrathful Gladiator's Sabatons of Triumph", quality: 4, itemLevel: 264, icon: "inv_boots_mail_08", twoHanded: false },
  51352: { name: "Wrathful Gladiator's Wristguards of Triumph", quality: 4, itemLevel: 264, icon: "inv_bracer_51", twoHanded: false },
  51498: { name: "Wrathful Gladiator's Ringmail Gauntlets", quality: 4, itemLevel: 270, icon: "inv_gauntlets_49", twoHanded: false },
  51356: { name: "Wrathful Gladiator's Cloak of Victory", quality: 4, itemLevel: 264, icon: "inv_misc_cape_16", twoHanded: false },
  50604: { name: "Band of the Bone Colossus", quality: 4, itemLevel: 277, icon: "inv_jewelry_ring_83", twoHanded: false },
  51394: { name: "Wrathful Gladiator's Longbow", quality: 4, itemLevel: 264, icon: "inv_weapon_bow_56", twoHanded: false },
  51515: { name: "Wrathful Gladiator's Cleaver", quality: 4, itemLevel: 264, icon: "inv_axe_116", twoHanded: false },
  51494: { name: "Wrathful Gladiator's Leather Helm", quality: 4, itemLevel: 270, icon: "inv_helmet_161", twoHanded: false },
  51496: { name: "Wrathful Gladiator's Leather Spaulders", quality: 4, itemLevel: 270, icon: "inv_shoulder_120", twoHanded: false },
  51492: { name: "Wrathful Gladiator's Leather Tunic", quality: 4, itemLevel: 270, icon: "inv_chest_leather_24", twoHanded: false },
  51368: { name: "Wrathful Gladiator's Belt of Triumph", quality: 4, itemLevel: 264, icon: "inv_belt_74", twoHanded: false },
  51495: { name: "Wrathful Gladiator's Leather Legguards", quality: 4, itemLevel: 270, icon: "inv_pants_leather_36", twoHanded: false },
  51369: { name: "Wrathful Gladiator's Boots of Triumph", quality: 4, itemLevel: 264, icon: "inv_boots_cloth_29", twoHanded: false },
  51370: { name: "Wrathful Gladiator's Armwraps of Triumph", quality: 4, itemLevel: 264, icon: "inv_bracer_53", twoHanded: false },
  51493: { name: "Wrathful Gladiator's Leather Gloves", quality: 4, itemLevel: 270, icon: "inv_gauntlets_97", twoHanded: false },
  51377: { name: "Medallion of the Alliance", quality: 4, itemLevel: 264, icon: "inv_jewelry_trinketpvp_01", twoHanded: false },
  51517: { name: "Wrathful Gladiator's Shanker", quality: 4, itemLevel: 264, icon: "inv_weapon_shortblade_106", twoHanded: false },
  51441: { name: "Wrathful Gladiator's Shiv", quality: 4, itemLevel: 264, icon: "inv_weapon_shortblade_106", twoHanded: false },
  51465: { name: "Wrathful Gladiator's Silk Cowl", quality: 4, itemLevel: 270, icon: "inv_helmet_159", twoHanded: false },
  51331: { name: "Wrathful Gladiator's Pendant of Dominance", quality: 4, itemLevel: 264, icon: "inv_jewelry_necklace_36", twoHanded: false },
  51467: { name: "Wrathful Gladiator's Silk Amice", quality: 4, itemLevel: 270, icon: "inv_shoulder_122", twoHanded: false },
  51463: { name: "Wrathful Gladiator's Silk Raiment", quality: 4, itemLevel: 270, icon: "inv_chest_cloth_81", twoHanded: false },
  51327: { name: "Wrathful Gladiator's Cord of Dominance", quality: 4, itemLevel: 264, icon: "inv_belt_70", twoHanded: false },
  51466: { name: "Wrathful Gladiator's Silk Trousers", quality: 4, itemLevel: 270, icon: "inv_pants_cloth_36", twoHanded: false },
  51328: { name: "Wrathful Gladiator's Treads of Dominance", quality: 4, itemLevel: 264, icon: "inv_boots_cloth_28", twoHanded: false },
  51329: { name: "Wrathful Gladiator's Cuffs of Dominance", quality: 4, itemLevel: 264, icon: "inv_bracer_50", twoHanded: false },
  51464: { name: "Wrathful Gladiator's Silk Handguards", quality: 4, itemLevel: 270, icon: "inv_gauntlets_95", twoHanded: false },
  51330: { name: "Wrathful Gladiator's Cloak of Dominance", quality: 4, itemLevel: 264, icon: "inv_misc_cape_20", twoHanded: false },
  51336: { name: "Wrathful Gladiator's Band of Dominance", quality: 4, itemLevel: 264, icon: "inv_jewelry_ring_60", twoHanded: false },
  50398: { name: "Ashen Band of Endless Destruction", quality: 4, itemLevel: 277, icon: "inv_jewelry_ring_83", twoHanded: false },
  50365: { name: "Phylactery of the Nameless Lich", quality: 4, itemLevel: 277, icon: "inv_jewelry_trinket_03", twoHanded: false },
  51404: { name: "Wrathful Gladiator's Battle Staff", quality: 4, itemLevel: 264, icon: "inv_staff_112", twoHanded: true },
  51451: { name: "Wrathful Gladiator's Wand of Alacrity", quality: 4, itemLevel: 264, icon: "inv_wand_36", twoHanded: false },
  40111: { name: "Bold Cardinal Ruby", quality: 4, itemLevel: 80, icon: "inv_jewelcrafting_gem_37", twoHanded: false },
  40113: { name: "Runed Cardinal Ruby", quality: 4, itemLevel: 80, icon: "inv_jewelcrafting_gem_37", twoHanded: false },
  40112: { name: "Delicate Cardinal Ruby", quality: 4, itemLevel: 80, icon: "inv_jewelcrafting_gem_37", twoHanded: false },
  41398: { name: "Relentless Earthsiege Diamond", quality: 3, itemLevel: 80, icon: "inv_jewelcrafting_shadowspirit_02", twoHanded: false },
  41333: { name: "Ember Skyflare Diamond", quality: 3, itemLevel: 80, icon: "inv_jewelcrafting_icediamond_02", twoHanded: false },
  49110: { name: "Nightmare Tear", quality: 4, itemLevel: 80, icon: "inv_misc_gem_pearl_12", twoHanded: false },
};

export class DummyItemInfoSource implements ItemInfoSource {
  async lookup(itemIds: readonly number[]): Promise<Map<number, ItemInfo>> {
    const result = new Map<number, ItemInfo>();
    for (const itemId of itemIds) {
      const info = DUMMY_ITEMS[itemId];
      if (info !== undefined) result.set(itemId, { itemId, ...info });
    }
    return result;
  }
}
