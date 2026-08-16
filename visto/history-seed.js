window.TRIP_HISTORY_SEED = [
  {
    id: 'history-thailand-2020-01',
    title: '2020/01/E Thailand',
    destination: 'Bangkok',
    countries: ['Thailand'],
    cities: ['Bangkok', 'Pattaya', 'Koh Larn'],
    startDate: '2020-01-31',
    endDate: '2020-01-31',
    dateLabel: '2020年1月末・4日間（Notionに正確な日付記載なし）',
    durationDays: 4,
    status: '過去', archived: false, budget: 0,
    mood: 'Notion「旅行記」から追加。日付は月末・4日間まで確認でき、正確な日付は未記載。',
    source: 'Notion 旅行記',
    sourceUrl: 'https://app.notion.com/p/76d9ee430f6b409586e732e37026afee',
    todos: [], expenses: [],
    pois: [
      {id:'hist-th-bangkok',name:'Bangkok',area:'Bangkok',category:'city',visited:true,visitDateLabel:'2020年1月末 Day 1-2'},
      {id:'hist-th-railway',name:'鉄道市場',area:'Bangkok',category:'spot',visited:true,visitDateLabel:'2020年1月末 Day 1'},
      {id:'hist-th-wat-arun',name:'Wat Arun',area:'Bangkok',category:'spot',visited:true,visitDateLabel:'2020年1月末 Day 2'},
      {id:'hist-th-wat-pho',name:'Wat Pho',area:'Bangkok',category:'spot',visited:true,visitDateLabel:'2020年1月末 Day 2'},
      {id:'hist-th-pattaya',name:'Pattaya Walking Street',area:'Pattaya',category:'spot',visited:true,visitDateLabel:'2020年1月末 Day 3'},
      {id:'hist-th-kohlarn',name:'Koh Larn',area:'Koh Larn',category:'nature',visited:true,visitDateLabel:'2020年1月末 Day 4'}
    ],
    days: []
  },
  {
    id: 'history-europe-2024-03',
    title: '2024/03/19-27 Europe',
    destination: 'Paris',
    countries: ['China','France','Belgium','Netherlands','Germany'],
    cities: ['Shanghai','Paris','Versailles','Brussels','Amsterdam','Cologne'],
    startDate: '2024-03-19', endDate: '2024-03-27', status: '過去', archived: false, budget: 0,
    mood: 'Notion「旅行記」の国別ページから実訪問都市を追加', source:'Notion 旅行記',
    sourceUrl:'https://app.notion.com/p/0405470a19664619b1023334c9e26231', todos:[], expenses:[],
    pois:[
      {id:'hist-eu-shanghai',name:'Lujiazui',area:'Shanghai',category:'city',visited:true,visitedAt:'2024-03-20'},
      {id:'hist-eu-paris',name:'Paris',area:'Paris',category:'city',visited:true,visitDateLabel:'2024/03/20・21・26'},
      {id:'hist-eu-versailles',name:'Versailles',area:'Versailles',category:'city',visited:true,visitDateLabel:'2024/03/21頃'},
      {id:'hist-eu-brussels',name:'Brussels',area:'Brussels',category:'city',visited:true,visitDateLabel:'2024/03/22・25'},
      {id:'hist-eu-amsterdam',name:'Amsterdam',area:'Amsterdam',category:'city',visited:true,visitedAt:'2024-03-23'},
      {id:'hist-eu-vangogh',name:'Van Gogh Museum（外観）',area:'Amsterdam',category:'museum',visited:true,visitedAt:'2024-03-23'},
      {id:'hist-eu-cologne',name:'Cologne',area:'Cologne',category:'city',visited:true,visitDateLabel:'2024/03/24-25'},
      {id:'hist-eu-cathedral',name:'Cologne Cathedral',area:'Cologne',category:'spot',visited:true,visitDateLabel:'2024/03/24-25'},
      {id:'hist-eu-hohenzollern',name:'Hohenzollern Bridge',area:'Cologne',category:'spot',visited:true,visitDateLabel:'2024/03/24-25'},
      {id:'hist-eu-fischmarkt',name:'Fischmarkt',area:'Cologne',category:'spot',visited:true,visitDateLabel:'2024/03/24-25'}
    ],
    days:[
      {id:'hist-eu-day20',date:'2024-03-20',title:'Shanghai → Paris',items:[{id:'hist-eu-i20a',title:'Lujiazui',poiId:'hist-eu-shanghai',memo:'Shanghai transit'},{id:'hist-eu-i20b',title:'Paris',poiId:'hist-eu-paris'}]},
      {id:'hist-eu-day22',date:'2024-03-22',title:'Belgium',items:[{id:'hist-eu-i22',title:'Brussels',poiId:'hist-eu-brussels'}]},
      {id:'hist-eu-day23',date:'2024-03-23',title:'Netherlands',items:[{id:'hist-eu-i23',title:'Amsterdam',poiId:'hist-eu-amsterdam'}]},
      {id:'hist-eu-day24',date:'2024-03-24',title:'Germany',items:[{id:'hist-eu-i24',title:'Cologne',poiId:'hist-eu-cologne'}]}
    ]
  },
  {
    id:'history-korea-2024-05', title:'2024/05/01-03 Korea', destination:'Seoul', countries:['South Korea'], cities:['Incheon','Seoul','Hongdae','Gangnam'],
    startDate:'2024-05-01',endDate:'2024-05-03',status:'過去',archived:false,budget:0,mood:'Notion旅行記から追加',source:'Notion 旅行記',sourceUrl:'https://app.notion.com/p/61f642ab8a8e465fafe8bfd58acde001',todos:[],expenses:[],
    pois:[
      {id:'hist-kr24-icn',name:'Incheon',area:'Incheon',category:'city',visited:true,visitedAt:'2024-05-01'},
      {id:'hist-kr24-gyeongbokgung',name:'Gyeongbokgung Palace',area:'Seoul',category:'spot',visited:true,visitedAt:'2024-05-02'},
      {id:'hist-kr24-bukchon',name:'Bukchon Hanok Village',area:'Seoul',category:'spot',visited:true,visitedAt:'2024-05-02'},
      {id:'hist-kr24-insadong',name:'Insadong',area:'Seoul',category:'spot',visited:true,visitedAt:'2024-05-02'},
      {id:'hist-kr24-starfield',name:'Starfield Library',area:'Seoul',category:'spot',visited:true,visitedAt:'2024-05-02'},
      {id:'hist-kr24-gangnam',name:'Gangnam Station',area:'Gangnam',category:'spot',visited:true,visitedAt:'2024-05-02'},
      {id:'hist-kr24-hongdae',name:'Hongdae',area:'Hongdae',category:'spot',visited:true,visitedAt:'2024-05-02'}
    ],days:[{id:'hist-kr24-day2',date:'2024-05-02',title:'Seoul',items:[{id:'hist-kr24-i1',title:'Gyeongbokgung Palace',poiId:'hist-kr24-gyeongbokgung'},{id:'hist-kr24-i2',title:'Bukchon Hanok Village',poiId:'hist-kr24-bukchon'},{id:'hist-kr24-i3',title:'Insadong',poiId:'hist-kr24-insadong'},{id:'hist-kr24-i4',title:'Gangnam',poiId:'hist-kr24-gangnam'},{id:'hist-kr24-i5',title:'Hongdae',poiId:'hist-kr24-hongdae'}]}]
  },
  {
    id:'history-turkey-2024-08',title:'2024/08/09-18 Turkey',destination:'Istanbul',countries:['Thailand','Türkiye'],cities:['Bangkok','Istanbul'],startDate:'2024-08-09',endDate:'2024-08-18',status:'過去',archived:false,budget:0,mood:'Bangkok経由、Istanbul滞在。Notion旅行記から追加',source:'Notion 旅行記',sourceUrl:'https://app.notion.com/p/348baf23111b4df7a4c26195728e3d82',todos:[],expenses:[],
    pois:[
      {id:'hist-tr-phayathai',name:'Phaya Thai',area:'Bangkok',category:'spot',visited:true,visitedAt:'2024-08-09'},
      {id:'hist-tr-grandbazaar',name:'Grand Bazaar',area:'Istanbul',category:'spot',visited:true,visitedAt:'2024-08-10'},
      {id:'hist-tr-hagia',name:'Hagia Sophia',area:'Istanbul',category:'spot',visited:true,visitedAt:'2024-08-10'},
      {id:'hist-tr-blue',name:'Blue Mosque',area:'Istanbul',category:'spot',visited:true,visitedAt:'2024-08-10'},
      {id:'hist-tr-taksim',name:'Taksim',area:'Istanbul',category:'spot',visited:true,visitedAt:'2024-08-10'}
    ],days:[{id:'hist-tr-day9',date:'2024-08-09',title:'Bangkok transit',items:[{id:'hist-tr-i9',title:'Phaya Thai',poiId:'hist-tr-phayathai'}]},{id:'hist-tr-day10',date:'2024-08-10',title:'Istanbul',items:[{id:'hist-tr-i10a',title:'Grand Bazaar',poiId:'hist-tr-grandbazaar'},{id:'hist-tr-i10b',title:'Hagia Sophia / Blue Mosque',poiId:'hist-tr-hagia'},{id:'hist-tr-i10c',title:'Taksim',poiId:'hist-tr-taksim'}]}]
  },
  {
    id:'history-poland-2024-12',title:'2024/12/27-2025/01/06 Poland',destination:'Warsaw',countries:['Poland'],cities:['Warsaw','Krakow'],startDate:'2024-12-27',endDate:'2025-01-06',status:'過去',archived:false,budget:0,mood:'Warsaw・Krakow。Notion旅行記の宿泊記録から追加',source:'Notion 旅行記',sourceUrl:'https://app.notion.com/p/15d290827880802d9a74f5e78e94ad57',todos:[],expenses:[],
    pois:[{id:'hist-pl-warsaw',name:'Warsaw',area:'Warsaw',category:'city',visited:true,visitDateLabel:'2024/12/27-2025/01/06'},{id:'hist-pl-krakow',name:'Krakow',area:'Krakow',category:'city',visited:true,visitDateLabel:'2024/12/27-2025/01/06'}],days:[]
  },
  {
    id:'history-korea-2025-02',title:'2025/02/01-02 Korea',destination:'Seoul',countries:['South Korea'],cities:['Incheon','Seoul','Hongdae'],startDate:'2025-02-01',endDate:'2025-02-02',status:'過去',archived:false,budget:0,mood:'Notion旅行記から追加',source:'Notion 旅行記',sourceUrl:'https://app.notion.com/p/18629082788080ecae8dcfb360191488',todos:[],expenses:[],
    pois:[{id:'hist-kr25-icn',name:'Incheon',area:'Incheon',category:'city',visited:true,visitDateLabel:'2025/02/01-02'},{id:'hist-kr25-hongdae',name:'Hongdae',area:'Hongdae',category:'spot',visited:true,visitDateLabel:'2025/02/01-02'},{id:'hist-kr25-deoksugung',name:'Deoksugung Palace',area:'Seoul',category:'spot',visited:true,visitDateLabel:'2025/02/01-02'}],days:[]
  },
  {
    id:'history-hongkong-2025-02',title:'2025/02/15-16 香港',destination:'Hong Kong',countries:['Hong Kong'],cities:['Hong Kong','Central','Tsim Sha Tsui'],startDate:'2025-02-15',endDate:'2025-02-16',status:'過去',archived:false,budget:0,mood:'Notion旅行記から追加',source:'Notion 旅行記',sourceUrl:'https://app.notion.com/p/1992908278808095b02bcd3f545aadae',todos:[],expenses:[],
    pois:[{id:'hist-hk-central',name:'Central',area:'Central',category:'city',visited:true,visitDateLabel:'2025/02/15-16'},{id:'hist-hk-tsim',name:'Tsim Sha Tsui',area:'Tsim Sha Tsui',category:'city',visited:true,visitDateLabel:'2025/02/15-16'},{id:'hist-hk-lights',name:'Symphony of Lights',area:'Tsim Sha Tsui',category:'spot',visited:true,visitDateLabel:'2025/02/15-16',memo:'Eyebarから鑑賞'}],days:[]
  },
  {
    id:'history-shanghai-2025-03',title:'2025/03/15-16 Shanghai',destination:'Shanghai',countries:['China'],cities:['Shanghai'],startDate:'2025-03-15',endDate:'2025-03-16',status:'過去',archived:false,budget:0,mood:'Notion旅行記から追加。具体スポットは「行くとこ」記載のため、確実な訪問都市のみ登録',source:'Notion 旅行記',sourceUrl:'https://app.notion.com/p/1b42908278808026a4acd1899f977bbc',todos:[],expenses:[],pois:[{id:'hist-sh25-city',name:'Shanghai',area:'Shanghai',category:'city',visited:true,visitDateLabel:'2025/03/15-16'}],days:[]
  },
  {
    id:'history-vietnam-2025-04',title:'2025/04/29-05/03 Vietnam',destination:'Hanoi',countries:['Vietnam'],cities:['Hanoi','Ha Long Bay'],startDate:'2025-04-29',endDate:'2025-05-03',status:'過去',archived:false,budget:0,mood:'Hanoi・Hạ Long Bay。Notion旅行記から追加',source:'Notion 旅行記',sourceUrl:'https://app.notion.com/p/1aa2908278808021a039f0713a951a5b',todos:[],expenses:[],
    pois:[{id:'hist-vn-hanoi',name:'Hanoi',area:'Hanoi',category:'city',visited:true,visitDateLabel:'2025/04/29-05/03'},{id:'hist-vn-halong',name:'Hạ Long Bay',area:'Ha Long Bay',category:'nature',visited:true,visitDateLabel:'2025/04/29-05/03'}],days:[]
  },
  {
    id:'history-munich-2025-08',title:'2025/08/10-08/16 Munich',destination:'Munich',countries:['Germany'],cities:['Munich','Nordhausen'],startDate:'2025-08-10',endDate:'2025-08-16',status:'過去',archived:false,budget:0,mood:'Venice案からMünchenへ変更。Notionの「行った」欄を反映',source:'Notion 旅行記',sourceUrl:'https://app.notion.com/p/248290827880802f904eedb36065b975',todos:[],expenses:[],
    pois:[{id:'hist-muc-oldtown',name:'Old Town',area:'Munich',category:'spot',visited:true,visitDateLabel:'2025/08/10-16'},{id:'hist-muc-residence',name:'Munich Residence',area:'Munich',category:'spot',visited:true,visitDateLabel:'2025/08/10-16'},{id:'hist-muc-english',name:'English Garden',area:'Munich',category:'nature',visited:true,visitDateLabel:'2025/08/10-16'},{id:'hist-muc-olympia',name:'Olympiapark München',area:'Munich',category:'spot',visited:true,visitDateLabel:'2025/08/10-16'},{id:'hist-muc-nymphenburg',name:'Nymphenburg Palace',area:'Munich',category:'spot',visited:true,visitDateLabel:'2025/08/10-16'},{id:'hist-muc-nordhausen',name:'Nordhausen',area:'Nordhausen',category:'city',visited:true,visitDateLabel:'2025/08/10-16'}],days:[]
  },
  {
    id:'history-nikko-2025-10',title:'2025/10/25-10/26 日光',destination:'Nikko',countries:['Japan'],cities:['Nikko'],startDate:'2025-10-25',endDate:'2025-10-26',status:'過去',archived:false,budget:0,mood:'Notion旅行記から追加。観光地は予定欄のみのため都市レベルで登録',source:'Notion 旅行記',sourceUrl:'https://app.notion.com/p/26e290827880801db309ceac89fd50b3',todos:[],expenses:[],pois:[{id:'hist-nikko-city',name:'Nikko',area:'Nikko',category:'city',visited:true,visitDateLabel:'2025/10/25-26'}],days:[]
  },
  {
    id:'history-shanghai-2025-12',title:'2025/12/05-06 Shanghai 3回目',destination:'Shanghai',countries:['China'],cities:['Shanghai'],startDate:'2025-12-05',endDate:'2025-12-06',status:'過去',archived:false,budget:0,mood:'Notion旅行記から追加。具体スポットはURLのみのため都市レベルで登録',source:'Notion 旅行記',sourceUrl:'https://app.notion.com/p/2c129082788080088576febe14eeae25',todos:[],expenses:[],pois:[{id:'hist-sh25-3-city',name:'Shanghai',area:'Shanghai',category:'city',visited:true,visitDateLabel:'2025/12/05-06'}],days:[]
  },
  {
    id:'history-germany-2025-12',title:'2025/12/26-2026/01/02 Frankfurt・Heidelberg',destination:'Heidelberg',countries:['Germany'],cities:['Frankfurt am Main','Heidelberg'],startDate:'2025-12-26',endDate:'2026-01-02',status:'過去',archived:false,budget:0,mood:'Notion旅行記から追加',source:'Notion 旅行記',sourceUrl:'https://app.notion.com/p/2b329082788080a79499d88090d1cfbc',todos:[],expenses:[],
    pois:[{id:'hist-de25-frankfurt',name:'Frankfurt am Main',area:'Frankfurt am Main',category:'city',visited:true,visitDateLabel:'2025/12/26-2026/01/02'},{id:'hist-de25-heidelberg',name:'Heidelberg',area:'Heidelberg',category:'city',visited:true,visitDateLabel:'2025/12/26-2026/01/02'},{id:'hist-de25-castle',name:'Heidelberg Castle',area:'Heidelberg',category:'spot',visited:true,visitDateLabel:'2025/12/26-2026/01/02'}],days:[]
  },
  {
    id:'history-kawagoe-2026-02',title:'2026/02/15 川越',destination:'Kawagoe',countries:['Japan'],cities:['Kawagoe'],startDate:'2026-02-15',endDate:'2026-02-15',status:'過去',archived:false,budget:0,mood:'Notion旅行記から追加',source:'Notion 旅行記',sourceUrl:'https://app.notion.com/p/30829082788080d9bc12dbbcdf42faae',todos:[],expenses:[],pois:[{id:'hist-kawagoe-city',name:'Kawagoe',area:'Kawagoe',category:'city',visited:true,visitedAt:'2026-02-15'}],days:[]
  },
  {
    id:'history-la-2026-04',title:'2026/04/25-05/04 Los Angeles',destination:'Los Angeles',countries:['United States'],cities:['Los Angeles','Marina del Rey','Koreatown','Las Vegas'],startDate:'2026-04-25',endDate:'2026-05-04',status:'過去',archived:false,budget:0,mood:'Notion旅行記から追加。予定だけの観光地は除外し、宿泊エリアとメモで実訪問が確認できる場所を登録',source:'Notion 旅行記',sourceUrl:'https://app.notion.com/p/34029082788080ce899fd5e25c7100bf',todos:[],expenses:[],
    pois:[{id:'hist-la-city',name:'Los Angeles',area:'Los Angeles',category:'city',visited:true,visitDateLabel:'2026/04/25-05/03'},{id:'hist-la-marina',name:'Marina del Rey',area:'Marina del Rey',category:'city',visited:true,visitDateLabel:'2026/04/25-旅行前半'},{id:'hist-la-koreatown',name:'Koreatown / Mid-Wilshire',area:'Koreatown',category:'city',visited:true,visitDateLabel:'2026年4月末-5月上旬'},{id:'hist-la-vegas',name:'Las Vegas',area:'Las Vegas',category:'city',visited:true,visitDateLabel:'2026/04/25-05/04',memo:'Notionメモに「ラスベガス散財」'}],days:[]
  }
];

window.TRIP_HISTORY_PATCHES = {
  'australia-2026': {
    source: 'Notion 旅行記 + Trip Plan実績',
    sourceUrl: 'https://app.notion.com/p/4462908278808251a8a581695a59a055'
  }
};
