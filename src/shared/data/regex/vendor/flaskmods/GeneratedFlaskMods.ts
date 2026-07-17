// Data sourced from poe-vendor-string (https://github.com/veiset/poe-vendor-string)
// Used with permission. All credit to veiset and contributors.
export interface FlaskTag {
  name: string
  sort: number
  color: string
}
export interface FlaskMod {
  level: number
  name: string
  value: string
  regex: string
}
export interface FlaskModGroup {
  minLevel: number
  description: string
  regex: string
  tag: FlaskTag
  mods: FlaskMod[]
}
export const flaskPrefix: FlaskModGroup[] = [
 {
   minLevel: 8,
   description: "#% chance to gain a Flask Charge when you deal a Critical Strike",
   regex: "dea",
   tag: { name: "default", sort: 0, color: "#fff" },
   mods: [   {
     level: 80,
     name: "Surgeon's",
     value: "(31-35)% chance to gain a Flask Charge when you deal a Critical Strike",
     regex: "eo"
   },   {
     level: 62,
     name: "Specialist's",
     value: "(26-30)% chance to gain a Flask Charge when you deal a Critical Strike",
     regex: "pec"
   },   {
     level: 44,
     name: "Doctor's",
     value: "(21-25)% chance to gain a Flask Charge when you deal a Critical Strike",
     regex: "doc"
   },   {
     level: 26,
     name: "Physician's",
     value: "(16-20)% chance to gain a Flask Charge when you deal a Critical Strike",
     regex: "phy"
   },   {
     level: 8,
     name: "Medic's",
     value: "(11-15)% chance to gain a Flask Charge when you deal a Critical Strike",
     regex: "c'"
   }]
 },
 {
   minLevel: 10,
   description: "#% increased Amount Recovered #% increased Charges per use",
   regex: "sed charges",
   tag: { name: "life", sort: 100, color: "#fab4bb" },
   mods: [   {
     level: 82,
     name: "Gypsum",
     value: "(45-50)% increased Amount Recovered (20-25)% increased Charges per use",
     regex: "yp"
   },   {
     level: 64,
     name: "Kainite",
     value: "(39-44)% increased Amount Recovered (20-25)% increased Charges per use",
     regex: "kai"
   },   {
     level: 46,
     name: "Kieserite",
     value: "(33-38)% increased Amount Recovered (20-25)% increased Charges per use",
     regex: "kie"
   },   {
     level: 28,
     name: "Dolomite",
     value: "(27-32)% increased Amount Recovered (20-25)% increased Charges per use",
     regex: "olo"
   },   {
     level: 10,
     name: "Nitrate",
     value: "(21-26)% increased Amount Recovered (20-25)% increased Charges per use",
     regex: "itr"
   }]
 },
 {
   minLevel: 1,
   description: "#% increased Amount Recovered #% reduced Recovery rate",
   regex: "ced r",
   tag: { name: "life", sort: 100, color: "#fab4bb" },
   mods: [   {
     level: 81,
     name: "Saturated",
     value: "(65-70)% increased Amount Recovered 33% reduced Recovery rate",
     regex: "atu"
   },   {
     level: 61,
     name: "Concentrated",
     value: "(59-64)% increased Amount Recovered 33% reduced Recovery rate",
     regex: "onc"
   },   {
     level: 41,
     name: "Full-bodied",
     value: "(53-58)% increased Amount Recovered 33% reduced Recovery rate",
     regex: "odie"
   },   {
     level: 21,
     name: "Opaque",
     value: "(47-52)% increased Amount Recovered 33% reduced Recovery rate",
     regex: "paq"
   },   {
     level: 1,
     name: "Substantial",
     value: "(41-46)% increased Amount Recovered 33% reduced Recovery rate",
     regex: "sub"
   }]
 },
 {
   minLevel: 3,
   description: "#% increased Charge Recovery",
   regex: "^\\d+% increased charge recovery$",
   tag: { name: "default", sort: 0, color: "#fff" },
   mods: [   {
     level: 83,
     name: "Perpetual",
     value: "(46-50)% increased Charge Recovery",
     regex: "rpe"
   },   {
     level: 63,
     name: "Bottomless",
     value: "(31-45)% increased Charge Recovery",
     regex: "ml"
   },   {
     level: 43,
     name: "Endless",
     value: "(26-30)% increased Charge Recovery",
     regex: "ndl"
   },   {
     level: 23,
     name: "Continuous",
     value: "(21-25)% increased Charge Recovery",
     regex: "nu"
   },   {
     level: 3,
     name: "Constant",
     value: "(16-20)% increased Charge Recovery",
     regex: "const"
   }]
 },
 {
   minLevel: 20,
   description: "#% increased Charge Recovery #% reduced effect",
   regex: "ced effect$",
   tag: { name: "default", sort: 0, color: "#fff" },
   mods: [   {
     level: 84,
     name: "Rationed",
     value: "(61-66)% increased Charge Recovery 25% reduced effect",
     regex: "atione"
   },   {
     level: 68,
     name: "Allocated",
     value: "(55-60)% increased Charge Recovery 25% reduced effect",
     regex: "oca"
   },   {
     level: 52,
     name: "Measured",
     value: "(49-54)% increased Charge Recovery 25% reduced effect",
     regex: "mea"
   },   {
     level: 36,
     name: "Provisioned",
     value: "(43-48)% increased Charge Recovery 25% reduced effect",
     regex: "pro"
   },   {
     level: 20,
     name: "Doled",
     value: "(37-42)% increased Charge Recovery 25% reduced effect",
     regex: "ole"
   }]
 },
 {
   minLevel: 20,
   description: "#% increased Duration",
   regex: "^\\d+% increased d",
   tag: { name: "default", sort: 0, color: "#fff" },
   mods: [   {
     level: 84,
     name: "Experimenter's",
     value: "(36-40)% increased Duration",
     regex: "xp"
   },   {
     level: 68,
     name: "Clinician's",
     value: "(31-35)% increased Duration",
     regex: "clin"
   },   {
     level: 52,
     name: "Examiner's",
     value: "(26-30)% increased Duration",
     regex: "xa"
   },   {
     level: 36,
     name: "Analyst's",
     value: "(21-25)% increased Duration",
     regex: "anal"
   },   {
     level: 20,
     name: "Investigator's",
     value: "(16-20)% increased Duration",
     regex: "inv"
   }]
 },
 {
   minLevel: 13,
   description: "#% increased Life Recovered Removes #% of Life Recovered from Mana when used",
   regex: "d l",
   tag: { name: "life", sort: 100, color: "#fab4bb" },
   mods: [   {
     level: 81,
     name: "Sapping",
     value: "(56-60)% increased Life Recovered Removes 10% of Life Recovered from Mana when used",
     regex: "sappi"
   },   {
     level: 64,
     name: "Vitiating",
     value: "(51-55)% increased Life Recovered Removes 10% of Life Recovered from Mana when used",
     regex: "vit"
   },   {
     level: 47,
     name: "Depleting",
     value: "(46-50)% increased Life Recovered Removes 10% of Life Recovered from Mana when used",
     regex: "etin"
   },   {
     level: 30,
     name: "Dizzying",
     value: "(40-44)% increased Life Recovered Removes 10% of Life Recovered from Mana when used",
     regex: "zz"
   },   {
     level: 13,
     name: "Impairing",
     value: "(35-39)% increased Life Recovered Removes 10% of Life Recovered from Mana when used",
     regex: "pai"
   }]
 },
 {
   minLevel: 13,
   description: "#% increased Mana Recovered Removes #% of Mana Recovered from Life when used",
   regex: "f ma",
   tag: { name: "life", sort: 100, color: "#fab4bb" },
   mods: [   {
     level: 81,
     name: "Caustic",
     value: "(65-70)% increased Mana Recovered Removes 15% of Mana Recovered from Life when used",
     regex: "aus"
   },   {
     level: 64,
     name: "Turbid",
     value: "(59-64)% increased Mana Recovered Removes 15% of Mana Recovered from Life when used",
     regex: "urb"
   },   {
     level: 47,
     name: "Congealed",
     value: "(53-58)% increased Mana Recovered Removes 15% of Mana Recovered from Life when used",
     regex: "gea"
   },   {
     level: 30,
     name: "Fermented",
     value: "(47-52)% increased Mana Recovered Removes 15% of Mana Recovered from Life when used",
     regex: "ferm"
   },   {
     level: 13,
     name: "Aged",
     value: "(41-46)% increased Mana Recovered Removes 15% of Mana Recovered from Life when used",
     regex: "ged"
   }]
 },
 {
   minLevel: 1,
   description: "#% increased Recovery rate",
   regex: "^\\d+% increased r",
   tag: { name: "life", sort: 100, color: "#fab4bb" },
   mods: [   {
     level: 81,
     name: "Catalysed",
     value: "(65-70)% increased Recovery rate",
     regex: "ata"
   },   {
     level: 61,
     name: "Condensed",
     value: "(59-64)% increased Recovery rate",
     regex: "ens"
   },   {
     level: 41,
     name: "Viscous",
     value: "(53-58)% increased Recovery rate",
     regex: "isc"
   },   {
     level: 21,
     name: "Thickened",
     value: "(47-52)% increased Recovery rate",
     regex: "hic"
   },   {
     level: 1,
     name: "Undiluted",
     value: "(41-46)% increased Recovery rate",
     regex: "ilu"
   }]
 },
 {
   minLevel: 6,
   description: "#% more Recovery if used while on Low Life",
   regex: "ry i",
   tag: { name: "life", sort: 100, color: "#fab4bb" },
   mods: [   {
     level: 82,
     name: "Cautious",
     value: "(125-130)% more Recovery if used while on Low Life",
     regex: "aut"
   },   {
     level: 63,
     name: "Careful",
     value: "(119-124)% more Recovery if used while on Low Life",
     regex: "efu"
   },   {
     level: 44,
     name: "Wary",
     value: "(113-118)% more Recovery if used while on Low Life",
     regex: "ary"
   },   {
     level: 25,
     name: "Prepared",
     value: "(107-112)% more Recovery if used while on Low Life",
     regex: "rep"
   },   {
     level: 6,
     name: "Prudent",
     value: "(101-106)% more Recovery if used while on Low Life",
     regex: "pru"
   }]
 },
 {
   minLevel: 3,
   description: "#% of Recovery applied Instantly #% reduced Amount Recovered #% increased Recovery rate",
   regex: "ppl",
   tag: { name: "life", sort: 100, color: "#fab4bb" },
   mods: [   {
     level: 79,
     name: "Bubbling",
     value: "50% of Recovery applied Instantly (39-36)% reduced Amount Recovered 135% increased Recovery rate",
     regex: "bub"
   },   {
     level: 60,
     name: "Effervescent",
     value: "50% of Recovery applied Instantly (43-40)% reduced Amount Recovered 135% increased Recovery rate",
     regex: "esc"
   },   {
     level: 41,
     name: "Effusive",
     value: "50% of Recovery applied Instantly (47-44)% reduced Amount Recovered 135% increased Recovery rate",
     regex: "ffu"
   },   {
     level: 22,
     name: "Ebullient",
     value: "50% of Recovery applied Instantly (51-48)% reduced Amount Recovered 135% increased Recovery rate",
     regex: "ebu"
   },   {
     level: 3,
     name: "Simmering",
     value: "50% of Recovery applied Instantly (55-52)% reduced Amount Recovered 135% increased Recovery rate",
     regex: "sim"
   }]
 },
 {
   minLevel: 14,
   description: "#% reduced Charges per use",
   regex: "^\\d+% reduced c",
   tag: { name: "default", sort: 0, color: "#fff" },
   mods: [   {
     level: 82,
     name: "Chemist's",
     value: "(28-26)% reduced Charges per use",
     regex: "^Chemist's"
   },   {
     level: 65,
     name: "Brewer's",
     value: "(25-23)% reduced Charges per use",
     regex: "we"
   },   {
     level: 48,
     name: "Practitioner's",
     value: "(22-20)% reduced Charges per use",
     regex: "pra"
   },   {
     level: 31,
     name: "Scholar's",
     value: "(19-17)% reduced Charges per use",
     regex: "sch"
   },   {
     level: 14,
     name: "Apprentice's",
     value: "(16-14)% reduced Charges per use",
     regex: "e'"
   }]
 },
 {
   minLevel: 20,
   description: "#% reduced Duration #% increased effect",
   regex: "ced d",
   tag: { name: "default", sort: 0, color: "#fff" },
   mods: [   {
     level: 80,
     name: "Alchemist's",
     value: "(27-23)% reduced Duration 25% increased effect",
     regex: "lc"
   },   {
     level: 50,
     name: "Dabbler's",
     value: "(32-28)% reduced Duration 25% increased effect",
     regex: "dab"
   },   {
     level: 20,
     name: "Abecedarian's",
     value: "(38-33)% reduced Duration 25% increased effect",
     regex: "abe"
   }]
 },
 {
   minLevel: 2,
   description: "+# to Maximum Charges",
   regex: "wid|lenti|unti|dant|ampl",
   tag: { name: "default", sort: 0, color: "#fff" },
   mods: [   {
     level: 2,
     name: "Wide",
     value: "+(16-19) to Maximum Charges",
     regex: "wid"
   },   {
     level: 22,
     name: "Plentiful",
     value: "+(20-23) to Maximum Charges",
     regex: "lenti"
   },   {
     level: 42,
     name: "Bountiful",
     value: "+(24-27) to Maximum Charges",
     regex: "unti"
   },   {
     level: 62,
     name: "Abundant",
     value: "+(28-31) to Maximum Charges",
     regex: "dant"
   },   {
     level: 82,
     name: "Ample",
     value: "+(32-35) to Maximum Charges",
     regex: "ampl"
   }]
 },
 {
   minLevel: 16,
   description: "Effect is not removed when Unreserved Mana is Filled Effect does not Queue #% reduced Amount Recovered",
   regex: "endu",
   tag: { name: "life", sort: 100, color: "#fab4bb" },
   mods: [   {
     level: 16,
     name: "Enduring",
     value: "Effect is not removed when Unreserved Mana is Filled Effect does not Queue 66% reduced Amount Recovered",
     regex: "endu"
   }]
 },
 {
   minLevel: 29,
   description: "Gain # Charge when you are Hit by an Enemy",
   regex: "sg",
   tag: { name: "default", sort: 0, color: "#fff" },
   mods: [   {
     level: 29,
     name: "Transgressor's",
     value: "Gain 1 Charge when you are Hit by an Enemy",
     regex: "sg"
   }]
 },
 {
   minLevel: 63,
   description: "Gain # Charges when you are Hit by an Enemy",
   regex: "s whe",
   tag: { name: "default", sort: 0, color: "#fff" },
   mods: [   {
     level: 63,
     name: "Masochist's",
     value: "Gain 2 Charges when you are Hit by an Enemy",
     regex: "aso"
   },   {
     level: 80,
     name: "Flagellant's",
     value: "Gain 3 Charges when you are Hit by an Enemy",
     regex: "lag"
   }]
 },
 {
   minLevel: 7,
   description: "Instant Recovery #% reduced Amount Recovered",
   regex: "see",
   tag: { name: "life", sort: 100, color: "#fab4bb" },
   mods: [   {
     level: 7,
     name: "Seething",
     value: "Instant Recovery 66% reduced Amount Recovered",
     regex: "see"
   }]
 },
 {
   minLevel: 9,
   description: "Instant Recovery when on Low Life #% reduced Amount Recovered",
   regex: "y w",
   tag: { name: "life", sort: 100, color: "#fab4bb" },
   mods: [   {
     level: 81,
     name: "Panicked",
     value: "Instant Recovery when on Low Life (14-11)% reduced Amount Recovered",
     regex: "pani"
   },   {
     level: 63,
     name: "Terrified",
     value: "Instant Recovery when on Low Life (18-15)% reduced Amount Recovered",
     regex: "err"
   },   {
     level: 45,
     name: "Alarmed",
     value: "Instant Recovery when on Low Life (22-19)% reduced Amount Recovered",
     regex: "alar"
   },   {
     level: 27,
     name: "Frightened",
     value: "Instant Recovery when on Low Life (26-23)% reduced Amount Recovered",
     regex: "fri"
   },   {
     level: 9,
     name: "Startled",
     value: "Instant Recovery when on Low Life (30-27)% reduced Amount Recovered",
     regex: "rtl"
   }]
 },
 {
   minLevel: 16,
   description: "Mana Recovery occurs instantly at the end of Effect #% increased Amount Recovered",
   regex: "reb",
   tag: { name: "life", sort: 100, color: "#fab4bb" },
   mods: [   {
     level: 16,
     name: "Foreboding",
     value: "Mana Recovery occurs instantly at the end of Effect 66% increased Amount Recovered",
     regex: "reb"
   }]
 },
];
export const flaskSuffix: FlaskModGroup[] = [
 {
   minLevel: 12,
   description: "#% Chance to Avoid being Stunned during Effect",
   regex: "unn",
   tag: { name: "Stun", sort: 20, color: "#c4c4c4" },
   mods: [   {
     level: 80,
     name: "of Tenaciousness",
     value: "(51-55)% Chance to Avoid being Stunned during Effect",
     regex: "ena"
   },   {
     level: 63,
     name: "of Relentlessness",
     value: "(46-50)% Chance to Avoid being Stunned during Effect",
     regex: "ssn"
   },   {
     level: 46,
     name: "of Persistence",
     value: "(41-45)% Chance to Avoid being Stunned during Effect",
     regex: "rsi"
   },   {
     level: 29,
     name: "of Surefootedness",
     value: "(36-40)% Chance to Avoid being Stunned during Effect",
     regex: "dn"
   },   {
     level: 12,
     name: "of Composure",
     value: "(31-35)% Chance to Avoid being Stunned during Effect",
     regex: "omp"
   }]
 },
 {
   minLevel: 1,
   description: "#% additional Elemental Resistances during Effect",
   regex: "% a",
   tag: { name: "default", sort: 0, color: "#fff" },
   mods: [   {
     level: 81,
     name: "of the Rainbow",
     value: "(18-20)% additional Elemental Resistances during Effect",
     regex: "nb"
   },   {
     level: 41,
     name: "of the Kaleidoscope",
     value: "(15-17)% additional Elemental Resistances during Effect",
     regex: "kal"
   },   {
     level: 1,
     name: "of the Crystal",
     value: "(12-14)% additional Elemental Resistances during Effect",
     regex: "cry"
   }]
 },
 {
   minLevel: 4,
   description: "#% chance to Avoid being Chilled during Effect #% chance to Avoid being Frozen during Effect",
   regex: "g ch",
   tag: { name: "avoidailment", sort: 60, color: "#c2ffe3" },
   mods: [   {
     level: 80,
     name: "of the Seal",
     value: "(51-55)% chance to Avoid being Chilled during Effect (51-55)% chance to Avoid being Frozen during Effect",
     regex: "e seal"
   },   {
     level: 61,
     name: "of the Beluga",
     value: "(46-50)% chance to Avoid being Chilled during Effect (46-50)% chance to Avoid being Frozen during Effect",
     regex: "elu"
   },   {
     level: 42,
     name: "of the Narwhal",
     value: "(41-45)% chance to Avoid being Chilled during Effect (41-45)% chance to Avoid being Frozen during Effect",
     regex: "rw"
   },   {
     level: 23,
     name: "of the Sea Lion",
     value: "(36-40)% chance to Avoid being Chilled during Effect (36-40)% chance to Avoid being Frozen during Effect",
     regex: "lio"
   },   {
     level: 4,
     name: "of the Orca",
     value: "(31-35)% chance to Avoid being Chilled during Effect (31-35)% chance to Avoid being Frozen during Effect",
     regex: "orc"
   }]
 },
 {
   minLevel: 6,
   description: "#% chance to Avoid being Ignited during Effect",
   regex: "g i",
   tag: { name: "avoidailment", sort: 60, color: "#c2ffe3" },
   mods: [   {
     level: 82,
     name: "of the Sunfish",
     value: "(51-55)% chance to Avoid being Ignited during Effect",
     regex: "sun"
   },   {
     level: 63,
     name: "of the Catfish",
     value: "(46-50)% chance to Avoid being Ignited during Effect",
     regex: "tf"
   },   {
     level: 44,
     name: "of the Carp",
     value: "(41-45)% chance to Avoid being Ignited during Effect",
     regex: "arp"
   },   {
     level: 25,
     name: "of the Goldfish",
     value: "(36-40)% chance to Avoid being Ignited during Effect",
     regex: "df"
   },   {
     level: 6,
     name: "of the Guppy",
     value: "(31-35)% chance to Avoid being Ignited during Effect",
     regex: "gup"
   }]
 },
 {
   minLevel: 6,
   description: "#% chance to Avoid being Shocked during Effect",
   regex: "g sh",
   tag: { name: "avoidailment", sort: 60, color: "#c2ffe3" },
   mods: [   {
     level: 82,
     name: "of Bog Moss",
     value: "(51-55)% chance to Avoid being Shocked during Effect",
     regex: "bog"
   },   {
     level: 63,
     name: "of Plume Moss",
     value: "(46-50)% chance to Avoid being Shocked during Effect",
     regex: "plu"
   },   {
     level: 44,
     name: "of Tooth Moss",
     value: "(41-45)% chance to Avoid being Shocked during Effect",
     regex: "too"
   },   {
     level: 25,
     name: "of Turf Moss",
     value: "(36-40)% chance to Avoid being Shocked during Effect",
     regex: "urf"
   },   {
     level: 6,
     name: "of Tree Moss",
     value: "(31-35)% chance to Avoid being Shocked during Effect",
     regex: "tree"
   }]
 },
 {
   minLevel: 12,
   description: "#% chance to Freeze, Shock and Ignite during Effect",
   regex: "e,",
   tag: { name: "default", sort: 0, color: "#fff" },
   mods: [   {
     level: 72,
     name: "of Infliction",
     value: "(31-34)% chance to Freeze, Shock and Ignite during Effect",
     regex: "inf"
   },   {
     level: 52,
     name: "of Wreaking",
     value: "(27-30)% chance to Freeze, Shock and Ignite during Effect",
     regex: "wr"
   },   {
     level: 32,
     name: "of Imposing",
     value: "(23-26)% chance to Freeze, Shock and Ignite during Effect",
     regex: "osi"
   },   {
     level: 12,
     name: "of Foisting",
     value: "(19-22)% chance to Freeze, Shock and Ignite during Effect",
     regex: "foi"
   }]
 },
 {
   minLevel: 6,
   description: "#% increased Armour during Effect",
   regex: "r d",
   tag: { name: "default", sort: 0, color: "#fff" },
   mods: [   {
     level: 84,
     name: "of the Armadillo",
     value: "(56-60)% increased Armour during Effect",
     regex: "rma"
   },   {
     level: 58,
     name: "of the Pangolin",
     value: "(51-55)% increased Armour during Effect",
     regex: "ang"
   },   {
     level: 32,
     name: "of the Tortoise",
     value: "(46-50)% increased Armour during Effect",
     regex: "ort"
   },   {
     level: 6,
     name: "of the Abalone",
     value: "(41-45)% increased Armour during Effect",
     regex: "aba"
   }]
 },
 {
   minLevel: 1,
   description: "#% increased Block and Stun Recovery during Effect",
   regex: "y d",
   tag: { name: "Stun", sort: 20, color: "#c4c4c4" },
   mods: [   {
     level: 73,
     name: "of Stabilisation",
     value: "(75-80)% increased Block and Stun Recovery during Effect",
     regex: "tab"
   },   {
     level: 55,
     name: "of Counterpoise",
     value: "(69-74)% increased Block and Stun Recovery during Effect",
     regex: "rpo"
   },   {
     level: 37,
     name: "of Ballast",
     value: "(63-68)% increased Block and Stun Recovery during Effect",
     regex: "ball"
   },   {
     level: 19,
     name: "of Bracing",
     value: "(57-62)% increased Block and Stun Recovery during Effect",
     regex: "bra"
   },   {
     level: 1,
     name: "of Stiffness",
     value: "(51-56)% increased Block and Stun Recovery during Effect",
     regex: "fn"
   }]
 },
 {
   minLevel: 18,
   description: "#% increased Critical Strike Chance during Effect",
   regex: "ce d",
   tag: { name: "default", sort: 0, color: "#fff" },
   mods: [   {
     level: 82,
     name: "of Incision",
     value: "(50-55)% increased Critical Strike Chance during Effect",
     regex: "nci"
   },   {
     level: 66,
     name: "of Penetrating",
     value: "(44-49)% increased Critical Strike Chance during Effect",
     regex: "net"
   },   {
     level: 50,
     name: "of Rupturing",
     value: "(38-43)% increased Critical Strike Chance during Effect",
     regex: "ptu"
   },   {
     level: 34,
     name: "of Piercing",
     value: "(32-37)% increased Critical Strike Chance during Effect",
     regex: "pie"
   },   {
     level: 18,
     name: "of Stinging",
     value: "(26-31)% increased Critical Strike Chance during Effect",
     regex: "ngi"
   }]
 },
 {
   minLevel: 6,
   description: "#% increased Evasion Rating during Effect",
   regex: "d ev",
   tag: { name: "default", sort: 0, color: "#fff" },
   mods: [   {
     level: 84,
     name: "of the Impala",
     value: "(56-60)% increased Evasion Rating during Effect",
     regex: "pal"
   },   {
     level: 58,
     name: "of the Ibex",
     value: "(51-55)% increased Evasion Rating during Effect",
     regex: "bex"
   },   {
     level: 32,
     name: "of the Antelope",
     value: "(46-50)% increased Evasion Rating during Effect",
     regex: "tel"
   },   {
     level: 6,
     name: "of the Gazelle",
     value: "(41-45)% increased Evasion Rating during Effect",
     regex: "gaz"
   }]
 },
 {
   minLevel: 5,
   description: "#% increased Movement Speed during Effect",
   regex: "eed d",
   tag: { name: "default", sort: 0, color: "#fff" },
   mods: [   {
     level: 85,
     name: "of the Cheetah",
     value: "(12-14)% increased Movement Speed during Effect",
     regex: "ah"
   },   {
     level: 65,
     name: "of the Lynx",
     value: "(9-11)% increased Movement Speed during Effect",
     regex: "nx"
   },   {
     level: 5,
     name: "of the Hare",
     value: "(6-8)% increased Movement Speed during Effect",
     regex: "hare"
   }]
 },
 {
   minLevel: 12,
   description: "#% increased Ward during Effect",
   regex: "d wa",
   tag: { name: "ward", sort: 200, color: "#8c7df0" },
   mods: [   {
     level: 78,
     name: "of Runeblazing",
     value: "(28-30)% increased Ward during Effect",
     regex: "zi"
   },   {
     level: 52,
     name: "of Runeflaring",
     value: "(25-27)% increased Ward during Effect",
     regex: "nef"
   },   {
     level: 26,
     name: "of Runeshining",
     value: "(22-24)% increased Ward during Effect",
     regex: "unes"
   },   {
     level: 12,
     name: "of Runegleaming",
     value: "(19-21)% increased Ward during Effect",
     regex: "eg"
   }]
 },
 {
   minLevel: 10,
   description: "#% of Attack Damage Leeched as Life during Effect",
   regex: "att",
   tag: { name: "leech", sort: 30, color: "#eeffe3" },
   mods: [   {
     level: 80,
     name: "of Bloodletting",
     value: "0.8% of Attack Damage Leeched as Life during Effect",
     regex: "odl"
   },   {
     level: 60,
     name: "of Butchery",
     value: "0.7% of Attack Damage Leeched as Life during Effect",
     regex: "tc"
   },   {
     level: 40,
     name: "of Carnage",
     value: "0.6% of Attack Damage Leeched as Life during Effect",
     regex: "arn"
   },   {
     level: 20,
     name: "of Gore",
     value: "0.5% of Attack Damage Leeched as Life during Effect",
     regex: "gor"
   },   {
     level: 10,
     name: "of Bloodshed",
     value: "0.4% of Attack Damage Leeched as Life during Effect",
     regex: "ods"
   }]
 },
 {
   minLevel: 10,
   description: "#% of Spell Damage Leeched as Energy Shield during Effect",
   regex: "erg",
   tag: { name: "leech", sort: 30, color: "#eeffe3" },
   mods: [   {
     level: 80,
     name: "of Draining",
     value: "0.8% of Spell Damage Leeched as Energy Shield during Effect",
     regex: "dra"
   },   {
     level: 60,
     name: "of Siphoning",
     value: "0.7% of Spell Damage Leeched as Energy Shield during Effect",
     regex: "sip"
   },   {
     level: 40,
     name: "of Tapping",
     value: "0.6% of Spell Damage Leeched as Energy Shield during Effect",
     regex: "tap"
   },   {
     level: 20,
     name: "of Depletion",
     value: "0.5% of Spell Damage Leeched as Energy Shield during Effect",
     regex: "etio"
   },   {
     level: 10,
     name: "of Diverting",
     value: "0.4% of Spell Damage Leeched as Energy Shield during Effect",
     regex: "div"
   }]
 },
 {
   minLevel: 4,
   description: "#% reduced Effect of Chill on you during Effect #% reduced Freeze Duration on you during Effect",
   regex: "l o",
   tag: { name: "avoidailment", sort: 60, color: "#c2ffe3" },
   mods: [   {
     level: 80,
     name: "of the Bear",
     value: "(65-60)% reduced Effect of Chill on you during Effect (65-60)% reduced Freeze Duration on you during Effect",
     regex: "bea"
   },   {
     level: 61,
     name: "of the Sable",
     value: "(59-52)% reduced Effect of Chill on you during Effect (59-52)% reduced Freeze Duration on you during Effect",
     regex: "sab"
   },   {
     level: 42,
     name: "of the Fox",
     value: "(52-48)% reduced Effect of Chill on you during Effect (52-48)% reduced Freeze Duration on you during Effect",
     regex: "fox"
   },   {
     level: 23,
     name: "of the Cat",
     value: "(47-42)% reduced Effect of Chill on you during Effect (47-42)% reduced Freeze Duration on you during Effect",
     regex: "of the Cat$"
   },   {
     level: 4,
     name: "of the Rabbit",
     value: "(41-36)% reduced Effect of Chill on you during Effect (41-36)% reduced Freeze Duration on you during Effect",
     regex: "rab"
   }]
 },
 {
   minLevel: 8,
   description: "#% reduced Effect of Curses on you during Effect",
   regex: "f cu",
   tag: { name: "ailment", sort: 50, color: "#e9c7fc" },
   mods: [   {
     level: 84,
     name: "of the Owl",
     value: "(65-60)% reduced Effect of Curses on you during Effect",
     regex: "wl"
   },   {
     level: 65,
     name: "of the Kakapo",
     value: "(59-52)% reduced Effect of Curses on you during Effect",
     regex: "kak"
   },   {
     level: 46,
     name: "of the Curlew",
     value: "(52-48)% reduced Effect of Curses on you during Effect",
     regex: "url"
   },   {
     level: 27,
     name: "of the Mockingbird",
     value: "(47-42)% reduced Effect of Curses on you during Effect",
     regex: "gb"
   },   {
     level: 8,
     name: "of the Petrel",
     value: "(41-36)% reduced Effect of Curses on you during Effect",
     regex: "petr"
   }]
 },
 {
   minLevel: 6,
   description: "#% reduced Effect of Shock on you during Effect",
   regex: "f sh",
   tag: { name: "avoidailment", sort: 60, color: "#c2ffe3" },
   mods: [   {
     level: 82,
     name: "of the Heron",
     value: "(65-60)% reduced Effect of Shock on you during Effect",
     regex: "ero"
   },   {
     level: 63,
     name: "of the Sanderling",
     value: "(59-52)% reduced Effect of Shock on you during Effect",
     regex: "erl"
   },   {
     level: 44,
     name: "of the Cormorant",
     value: "(52-48)% reduced Effect of Shock on you during Effect",
     regex: "orm"
   },   {
     level: 25,
     name: "of the Sandpiper",
     value: "(47-42)% reduced Effect of Shock on you during Effect",
     regex: "dp"
   },   {
     level: 6,
     name: "of the Plover",
     value: "(41-36)% reduced Effect of Shock on you during Effect",
     regex: "plo"
   }]
 },
 {
   minLevel: 10,
   description: "Grants #% of Life Recovery to Minions",
   regex: "nio",
   tag: { name: "life", sort: 100, color: "#fab4bb" },
   mods: [   {
     level: 82,
     name: "of the Necromancer",
     value: "Grants (180-200)% of Life Recovery to Minions",
     regex: "nec"
   },   {
     level: 64,
     name: "of the Conjurer",
     value: "Grants (160-179)% of Life Recovery to Minions",
     regex: "nj"
   },   {
     level: 46,
     name: "of the Summoner",
     value: "Grants (140-159)% of Life Recovery to Minions",
     regex: "umm"
   },   {
     level: 28,
     name: "of the Acolyte",
     value: "Grants (120-139)% of Life Recovery to Minions",
     regex: "yt"
   },   {
     level: 10,
     name: "of the Novice",
     value: "Grants (100-119)% of Life Recovery to Minions",
     regex: "nov"
   }]
 },
 {
   minLevel: 8,
   description: "Grants Immunity to Bleeding for # seconds if used while Bleeding Grants Immunity to Corrupted Blood for # seconds if used while affected by Corrupted Blood",
   regex: "aff",
   tag: { name: "ailment", sort: 50, color: "#e9c7fc" },
   mods: [   {
     level: 56,
     name: "of Allaying",
     value: "Grants Immunity to Bleeding for (12-14) seconds if used while Bleeding Grants Immunity to Corrupted Blood for (12-14) seconds if used while affected by Corrupted Blood",
     regex: "lay"
   },   {
     level: 80,
     name: "of Assuaging",
     value: "Grants Immunity to Bleeding for (15-17) seconds if used while Bleeding Grants Immunity to Corrupted Blood for (15-17) seconds if used while affected by Corrupted Blood",
     regex: "sua"
   },   {
     level: 8,
     name: "of Sealing",
     value: "Grants Immunity to Bleeding for (6-8) seconds if used while Bleeding Grants Immunity to Corrupted Blood for (6-8) seconds if used while affected by Corrupted Blood",
     regex: "eali"
   },   {
     level: 32,
     name: "of Alleviation",
     value: "Grants Immunity to Bleeding for (9-11) seconds if used while Bleeding Grants Immunity to Corrupted Blood for (9-11) seconds if used while affected by Corrupted Blood",
     regex: "evi"
   }]
 },
 {
   minLevel: 4,
   description: "Grants Immunity to Chill for # seconds if used while Chilled Grants Immunity to Freeze for # seconds if used while Frozen",
   regex: "l f",
   tag: { name: "eleilment", sort: 45, color: "#c2ffe3" },
   mods: [   {
     level: 52,
     name: "of Entropy",
     value: "Grants Immunity to Chill for (12-14) seconds if used while Chilled Grants Immunity to Freeze for (12-14) seconds if used while Frozen",
     regex: "tro"
   },   {
     level: 76,
     name: "of Thawing",
     value: "Grants Immunity to Chill for (15-17) seconds if used while Chilled Grants Immunity to Freeze for (15-17) seconds if used while Frozen",
     regex: "aw"
   },   {
     level: 4,
     name: "of Convection",
     value: "Grants Immunity to Chill for (6-8) seconds if used while Chilled Grants Immunity to Freeze for (6-8) seconds if used while Frozen",
     regex: "onv"
   },   {
     level: 28,
     name: "of Thermodynamics",
     value: "Grants Immunity to Chill for (9-11) seconds if used while Chilled Grants Immunity to Freeze for (9-11) seconds if used while Frozen",
     regex: "cs"
   }]
 },
 {
   minLevel: 16,
   description: "Grants Immunity to Hinder for # seconds if used while Hindered Grants Immunity to Maim for # seconds if used while Maimed",
   regex: "mai",
   tag: { name: "ailment", sort: 50, color: "#e9c7fc" },
   mods: [   {
     level: 60,
     name: "of Freedom",
     value: "Grants Immunity to Hinder for (12-14) seconds if used while Hindered Grants Immunity to Maim for (12-14) seconds if used while Maimed",
     regex: "edo"
   },   {
     level: 82,
     name: "of Liberation",
     value: "Grants Immunity to Hinder for (15-17) seconds if used while Hindered Grants Immunity to Maim for (15-17) seconds if used while Maimed",
     regex: "lib"
   },   {
     level: 16,
     name: "of Movement",
     value: "Grants Immunity to Hinder for (6-8) seconds if used while Hindered Grants Immunity to Maim for (6-8) seconds if used while Maimed",
     regex: "f mov"
   },   {
     level: 38,
     name: "of Motion",
     value: "Grants Immunity to Hinder for (9-11) seconds if used while Hindered Grants Immunity to Maim for (9-11) seconds if used while Maimed",
     regex: "mot"
   }]
 },
 {
   minLevel: 6,
   description: "Grants Immunity to Ignite for # seconds if used while Ignited Removes all Burning when used",
   regex: "l b",
   tag: { name: "eleilment", sort: 45, color: "#c2ffe3" },
   mods: [   {
     level: 54,
     name: "of Quelling",
     value: "Grants Immunity to Ignite for (12-14) seconds if used while Ignited Removes all Burning when used",
     regex: "uel"
   },   {
     level: 78,
     name: "of Quenching",
     value: "Grants Immunity to Ignite for (15-17) seconds if used while Ignited Removes all Burning when used",
     regex: "uen"
   },   {
     level: 6,
     name: "of Damping",
     value: "Grants Immunity to Ignite for (6-8) seconds if used while Ignited Removes all Burning when used",
     regex: "mpi"
   },   {
     level: 30,
     name: "of Quashing",
     value: "Grants Immunity to Ignite for (9-11) seconds if used while Ignited Removes all Burning when used",
     regex: "uas"
   }]
 },
 {
   minLevel: 16,
   description: "Grants Immunity to Poison for # seconds if used while Poisoned",
   regex: "n fo",
   tag: { name: "ailment", sort: 50, color: "#e9c7fc" },
   mods: [   {
     level: 60,
     name: "of the Cure",
     value: "Grants Immunity to Poison for (12-14) seconds if used while Poisoned",
     regex: "cure"
   },   {
     level: 82,
     name: "of the Antidote",
     value: "Grants Immunity to Poison for (15-17) seconds if used while Poisoned",
     regex: "tid"
   },   {
     level: 16,
     name: "of the Antitoxin",
     value: "Grants Immunity to Poison for (6-8) seconds if used while Poisoned",
     regex: "ito"
   },   {
     level: 38,
     name: "of the Remedy",
     value: "Grants Immunity to Poison for (9-11) seconds if used while Poisoned",
     regex: "edy"
   }]
 },
 {
   minLevel: 6,
   description: "Grants Immunity to Shock for # seconds if used while Shocked",
   regex: "k f",
   tag: { name: "eleilment", sort: 45, color: "#c2ffe3" },
   mods: [   {
     level: 54,
     name: "of Insulation",
     value: "Grants Immunity to Shock for (12-14) seconds if used while Shocked",
     regex: "ula"
   },   {
     level: 78,
     name: "of the Dielectric",
     value: "Grants Immunity to Shock for (15-17) seconds if used while Shocked",
     regex: "lec"
   },   {
     level: 6,
     name: "of Earthing",
     value: "Grants Immunity to Shock for (6-8) seconds if used while Shocked",
     regex: "rth"
   },   {
     level: 30,
     name: "of Grounding",
     value: "Grants Immunity to Shock for (9-11) seconds if used while Shocked",
     regex: "ndin"
   }]
 },
 {
   minLevel: 30,
   description: "Hinders nearby Enemies with #% reduced Movement Speed if used while not on Full Life",
   regex: "d if used while not on full l",
   tag: { name: "life", sort: 100, color: "#fab4bb" },
   mods: [   {
     level: 84,
     name: "of Restraint",
     value: "Hinders nearby Enemies with (35-40)% reduced Movement Speed if used while not on Full Life",
     regex: "estr"
   },   {
     level: 66,
     name: "of Occlusion",
     value: "Hinders nearby Enemies with (29-34)% reduced Movement Speed if used while not on Full Life",
     regex: "ccl"
   },   {
     level: 48,
     name: "of Obstruction",
     value: "Hinders nearby Enemies with (23-28)% reduced Movement Speed if used while not on Full Life",
     regex: "ob"
   },   {
     level: 30,
     name: "of Interference",
     value: "Hinders nearby Enemies with (17-22)% reduced Movement Speed if used while not on Full Life",
     regex: "erf"
   }]
 },
 {
   minLevel: 30,
   description: "Hinders nearby Enemies with #% reduced Movement Speed if used while not on Full Mana",
   regex: "mana$",
   tag: { name: "life", sort: 100, color: "#fab4bb" },
   mods: [   {
     level: 84,
     name: "of Restraint",
     value: "Hinders nearby Enemies with (35-40)% reduced Movement Speed if used while not on Full Mana",
     regex: "estr"
   },   {
     level: 66,
     name: "of Occlusion",
     value: "Hinders nearby Enemies with (29-34)% reduced Movement Speed if used while not on Full Mana",
     regex: "ccl"
   },   {
     level: 48,
     name: "of Obstruction",
     value: "Hinders nearby Enemies with (23-28)% reduced Movement Speed if used while not on Full Mana",
     regex: "ob"
   },   {
     level: 30,
     name: "of Interference",
     value: "Hinders nearby Enemies with (17-22)% reduced Movement Speed if used while not on Full Mana",
     regex: "erf"
   }]
 },
 {
   minLevel: 8,
   description: "Immunity to Bleeding and Corrupted Blood during Effect #% less Duration",
   regex: "g a",
   tag: { name: "ailment", sort: 50, color: "#e9c7fc" },
   mods: [   {
     level: 76,
     name: "of the Iguana",
     value: "Immunity to Bleeding and Corrupted Blood during Effect (39-35)% less Duration",
     regex: "igu"
   },   {
     level: 42,
     name: "of the Skink",
     value: "Immunity to Bleeding and Corrupted Blood during Effect (44-40)% less Duration",
     regex: "skin"
   },   {
     level: 8,
     name: "of the Lizard",
     value: "Immunity to Bleeding and Corrupted Blood during Effect (49-45)% less Duration",
     regex: "za"
   }]
 },
 {
   minLevel: 4,
   description: "Immunity to Freeze and Chill during Effect #% less Duration",
   regex: "ze a",
   tag: { name: "eleilment", sort: 45, color: "#c2ffe3" },
   mods: [   {
     level: 72,
     name: "of the Penguin",
     value: "Immunity to Freeze and Chill during Effect (39-35)% less Duration",
     regex: "eng"
   },   {
     level: 38,
     name: "of the Walrus",
     value: "Immunity to Freeze and Chill during Effect (44-40)% less Duration",
     regex: "wal"
   },   {
     level: 4,
     name: "of the Deer",
     value: "Immunity to Freeze and Chill during Effect (49-45)% less Duration",
     regex: "dee"
   }]
 },
 {
   minLevel: 6,
   description: "Immunity to Ignite during Effect Removes Burning on use #% less Duration",
   regex: "s b",
   tag: { name: "eleilment", sort: 45, color: "#c2ffe3" },
   mods: [   {
     level: 74,
     name: "of the Starfish",
     value: "Immunity to Ignite during Effect Removes Burning on use (39-35)% less Duration",
     regex: "arf"
   },   {
     level: 40,
     name: "of the Mussel",
     value: "Immunity to Ignite during Effect Removes Burning on use (44-40)% less Duration",
     regex: "mus"
   },   {
     level: 6,
     name: "of the Urchin",
     value: "Immunity to Ignite during Effect Removes Burning on use (49-45)% less Duration",
     regex: "urc"
   }]
 },
 {
   minLevel: 16,
   description: "Immunity to Poison during Effect #% less Duration",
   regex: "on d",
   tag: { name: "ailment", sort: 50, color: "#e9c7fc" },
   mods: [   {
     level: 76,
     name: "of the Opossum",
     value: "Immunity to Poison during Effect (39-35)% less Duration",
     regex: "opo"
   },   {
     level: 46,
     name: "of the Hedgehog",
     value: "Immunity to Poison during Effect (44-40)% less Duration",
     regex: "dg"
   },   {
     level: 16,
     name: "of the Skunk",
     value: "Immunity to Poison during Effect (49-45)% less Duration",
     regex: "ku"
   }]
 },
 {
   minLevel: 6,
   description: "Immunity to Shock during Effect #% less Duration",
   regex: "k du",
   tag: { name: "eleilment", sort: 45, color: "#c2ffe3" },
   mods: [   {
     level: 74,
     name: "of the Eel",
     value: "Immunity to Shock during Effect (39-35)% less Duration",
     regex: "eel"
   },   {
     level: 40,
     name: "of the Moray",
     value: "Immunity to Shock during Effect (44-40)% less Duration",
     regex: "ray"
   },   {
     level: 6,
     name: "of the Conger",
     value: "Immunity to Shock during Effect (49-45)% less Duration",
     regex: "ger"
   }]
 },
 {
   minLevel: 25,
   description: "Recover an additional #% of Flask's Life Recovery Amount over # seconds if used while not on Full Life",
   regex: "^rec",
   tag: { name: "life", sort: 100, color: "#fab4bb" },
   mods: [   {
     level: 81,
     name: "of Perenniality",
     value: "Recover an additional (35-40)% of Flask's Life Recovery Amount over 10 seconds if used while not on Full Life",
     regex: "enn"
   },   {
     level: 67,
     name: "of Incessance",
     value: "Recover an additional (29-34)% of Flask's Life Recovery Amount over 10 seconds if used while not on Full Life",
     regex: "ssa"
   },   {
     level: 53,
     name: "of Bounty",
     value: "Recover an additional (23-28)% of Flask's Life Recovery Amount over 10 seconds if used while not on Full Life",
     regex: "unty"
   },   {
     level: 39,
     name: "of Plenty",
     value: "Recover an additional (17-22)% of Flask's Life Recovery Amount over 10 seconds if used while not on Full Life",
     regex: "enty"
   },   {
     level: 25,
     name: "of Abundance",
     value: "Recover an additional (11-16)% of Flask's Life Recovery Amount over 10 seconds if used while not on Full Life",
     regex: "danc"
   }]
 },
 {
   minLevel: 18,
   description: "Removes Curses on use",
   regex: "rdi",
   tag: { name: "ailment", sort: 50, color: "#e9c7fc" },
   mods: [   {
     level: 18,
     name: "of Warding",
     value: "Removes Curses on use",
     regex: "rdi"
   }]
 },
];