// Comprehensive geographical location presets and address generator for company cards across countries

export type LocationPreset = {
  address: string;
  latitude: number;
  longitude: number;
  city: string;
};

export const USA_PRESETS: LocationPreset[] = [
  {
    city: "Seattle",
    address: "500 Pine St, Seattle, WA 98101, USA",
    latitude: 47.6119,
    longitude: -122.3364,
  },
  {
    city: "San Francisco",
    address: "500 Howard St, San Francisco, CA 94105, USA",
    latitude: 37.7886,
    longitude: -122.3972,
  },
  {
    city: "Los Angeles",
    address: "333 S Grand Ave, Los Angeles, CA 90071, USA",
    latitude: 34.0519,
    longitude: -118.2518,
  },
  {
    city: "San Diego",
    address: "401 B St, Suite 1200, San Diego, CA 92101, USA",
    latitude: 32.7174,
    longitude: -117.1593,
  },
  {
    city: "Portland",
    address: "1120 SW 5th Ave, Portland, OR 97204, USA",
    latitude: 45.5160,
    longitude: -122.6775,
  },
  {
    city: "Boise",
    address: "800 W Main St, Boise, ID 83702, USA",
    latitude: 43.6155,
    longitude: -116.2038,
  },
  {
    city: "Las Vegas",
    address: "300 S 4th St, Las Vegas, NV 89101, USA",
    latitude: 36.1669,
    longitude: -115.1438,
  },
  {
    city: "Salt Lake City",
    address: "222 S Main St, Salt Lake City, UT 84101, USA",
    latitude: 40.7644,
    longitude: -111.8910,
  },
  {
    city: "Phoenix",
    address: "100 W Washington St, Phoenix, AZ 85003, USA",
    latitude: 33.4484,
    longitude: -112.0758,
  },
  {
    city: "Denver",
    address: "1144 15th St, Denver, CO 80202, USA",
    latitude: 39.7485,
    longitude: -104.9969,
  },
  {
    city: "Albuquerque",
    address: "201 3rd St NW, Albuquerque, NM 87102, USA",
    latitude: 35.0874,
    longitude: -106.6508,
  },
  {
    city: "Minneapolis",
    address: "80 S 8th St, Minneapolis, MN 55402, USA",
    latitude: 44.9759,
    longitude: -93.2718,
  },
  {
    city: "Kansas City",
    address: "1200 Main St, Kansas City, MO 64105, USA",
    latitude: 39.0997,
    longitude: -94.5828,
  },
  {
    city: "Dallas",
    address: "2100 Ross Ave, Suite 900, Dallas, TX 75201, USA",
    latitude: 32.7885,
    longitude: -96.7972,
  },
  {
    city: "Austin",
    address: "500 W 2nd St, Austin, TX 78701, USA",
    latitude: 30.2655,
    longitude: -97.7479,
  },
  {
    city: "Houston",
    address: "1000 Main St, Houston, TX 77002, USA",
    latitude: 29.7589,
    longitude: -95.3659,
  },
  {
    city: "New Orleans",
    address: "909 Poydras St, New Orleans, LA 70112, USA",
    latitude: 29.9515,
    longitude: -90.0715,
  },
  {
    city: "Chicago",
    address: "233 S Wacker Dr, Chicago, IL 60606, USA",
    latitude: 41.8789,
    longitude: -87.6359,
  },
  {
    city: "Detroit",
    address: "100 Renaissance Center, Detroit, MI 48243, USA",
    latitude: 42.3293,
    longitude: -83.0398,
  },
  {
    city: "Indianapolis",
    address: "111 Monument Cir, Indianapolis, IN 46204, USA",
    latitude: 39.7686,
    longitude: -86.1581,
  },
  {
    city: "Nashville",
    address: "150 4th Ave N, Nashville, TN 37219, USA",
    latitude: 36.1648,
    longitude: -86.7792,
  },
  {
    city: "Atlanta",
    address: "191 Peachtree St NE, Atlanta, GA 30303, USA",
    latitude: 33.7590,
    longitude: -84.3875,
  },
  {
    city: "Miami",
    address: "801 Brickell Ave, Miami, FL 33131, USA",
    latitude: 25.7654,
    longitude: -80.1912,
  },
  {
    city: "Charlotte",
    address: "550 S Tryon St, Charlotte, NC 28202, USA",
    latitude: 35.2235,
    longitude: -80.8488,
  },
  {
    city: "Washington DC",
    address: "1001 Pennsylvania Ave NW, Washington, DC 20004, USA",
    latitude: 38.8948,
    longitude: -77.0264,
  },
  {
    city: "Philadelphia",
    address: "1735 Market St, Philadelphia, PA 19103, USA",
    latitude: 39.9535,
    longitude: -75.1695,
  },
  {
    city: "New York",
    address: "350 5th Ave, New York, NY 10118, USA",
    latitude: 40.7484,
    longitude: -73.9857,
  },
  {
    city: "Boston",
    address: "200 Clarendon St, Boston, MA 02116, USA",
    latitude: 42.3498,
    longitude: -71.0754,
  },
  {
    city: "Columbus",
    address: "41 S High St, Columbus, OH 43215, USA",
    latitude: 39.9598,
    longitude: -82.9998,
  },
  {
    city: "Pittsburgh",
    address: "600 Grant St, Pittsburgh, PA 15219, USA",
    latitude: 40.4406,
    longitude: -79.9959,
  },
];

export const PORTUGAL_PRESETS: LocationPreset[] = [
  {
    city: "Porto",
    address: "Avenida da Boavista 1200, 4100-113 Porto, Portugal",
    latitude: 41.1579,
    longitude: -8.6291,
  },
  {
    city: "Lisboa",
    address: "Avenida da Liberdade 245, 1250-143 Lisboa, Portugal",
    latitude: 38.7205,
    longitude: -9.1465,
  },
  {
    city: "Braga",
    address: "Avenida Central 33, 4710-228 Braga, Portugal",
    latitude: 41.5518,
    longitude: -8.4201,
  },
  {
    city: "Coimbra",
    address: "Rua Ferreira Borges 85, 3000-180 Coimbra, Portugal",
    latitude: 40.2089,
    longitude: -8.4289,
  },
  {
    city: "Aveiro",
    address: "Rua João Mendonça 14, 3800-200 Aveiro, Portugal",
    latitude: 40.6412,
    longitude: -8.6535,
  },
  {
    city: "Guimarães",
    address: "Largo do Toural 45, 4810-427 Guimarães, Portugal",
    latitude: 41.4426,
    longitude: -8.2962,
  },
  {
    city: "Viseu",
    address: "Rua Formosa 62, 3500-135 Viseu, Portugal",
    latitude: 40.6582,
    longitude: -7.9135,
  },
  {
    city: "Faro",
    address: "Rua de Santo António 48, 8000-283 Faro, Portugal",
    latitude: 37.0164,
    longitude: -7.9338,
  },
  {
    city: "Setúbal",
    address: "Avenida Luísa Todi 280, 2900-452 Setúbal, Portugal",
    latitude: 38.5235,
    longitude: -8.8928,
  },
  {
    city: "Leiria",
    address: "Largo 5 de Outubro 12, 2400-120 Leiria, Portugal",
    latitude: 39.7445,
    longitude: -8.8082,
  },
  {
    city: "Évora",
    address: "Praça do Giraldo 18, 7000-508 Évora, Portugal",
    latitude: 38.5714,
    longitude: -7.9095,
  },
  {
    city: "Viana do Castelo",
    address: "Praça da República 10, 4900-318 Viana do Castelo, Portugal",
    latitude: 41.6938,
    longitude: -8.8285,
  },
  {
    city: "Cascais",
    address: "Alameda dos Combatentes da Grande Guerra 50, 2750-326 Cascais, Portugal",
    latitude: 38.6970,
    longitude: -9.4215,
  },
  {
    city: "Sintra",
    address: "Praça da República 23, 2710-616 Sintra, Portugal",
    latitude: 38.7963,
    longitude: -9.3908,
  },
  {
    city: "Vila Real",
    address: "Avenida Carvalho Araújo 40, 5000-657 Vila Real, Portugal",
    latitude: 41.2965,
    longitude: -7.7460,
  },
];

export const MEXICO_PRESETS: LocationPreset[] = [
  {
    city: "Guadalajara",
    address: "Av. Américas 1500, Country Club, 44610 Guadalajara, Jal., Mexico",
    latitude: 20.6978,
    longitude: -103.3762,
  },
  {
    city: "Zapopan",
    address: "Blvd. Puerta de Hierro 5153, 45116 Zapopan, Jal., Mexico",
    latitude: 20.7092,
    longitude: -103.4140,
  },
  {
    city: "Ciudad de México",
    address: "Paseo de la Reforma 222, Juárez, 06600 Ciudad de México, Mexico",
    latitude: 19.4285,
    longitude: -99.1618,
  },
  {
    city: "Monterrey",
    address: "Av. Constitución 2050, Obispado, 64060 Monterrey, N.L., Mexico",
    latitude: 25.6714,
    longitude: -100.3392,
  },
  {
    city: "Puebla",
    address: "Blvd. Atlixcáyotl 1499, Reserva Territorial Atlixcáyotl, 72810 Puebla, Pue., Mexico",
    latitude: 19.0305,
    longitude: -98.2325,
  },
  {
    city: "Querétaro",
    address: "Blvd. Bernardo Quintana 7001, Centro Sur, 76090 Santiago de Querétaro, Qro., Mexico",
    latitude: 20.5732,
    longitude: -100.3658,
  },
  {
    city: "Cancún",
    address: "Av. Bonampak Sm 6 Mz 1, 77500 Cancún, Q.R., Mexico",
    latitude: 21.1518,
    longitude: -86.8245,
  },
  {
    city: "Mérida",
    address: "Paseo de Montejo 495, Centro, 97000 Mérida, Yuc., Mexico",
    latitude: 20.9852,
    longitude: -89.6175,
  },
  {
    city: "Tijuana",
    address: "Blvd. Agua Caliente 4558, Aviación, 22014 Tijuana, B.C., Mexico",
    latitude: 32.5115,
    longitude: -117.0142,
  },
  {
    city: "León",
    address: "Blvd. Campestre 1003, Jardines del Moral, 37160 León, Gto., Mexico",
    latitude: 21.1472,
    longitude: -101.6918,
  },
  {
    city: "San Luis Potosí",
    address: "Av. Venustiano Carranza 1115, Tequisquiapan, 78230 San Luis Potosí, S.L.P., Mexico",
    latitude: 22.1528,
    longitude: -101.0012,
  },
  {
    city: "Aguascalientes",
    address: "Av. Universidad 1001, Bosques del Prado, 20127 Aguascalientes, Ags., Mexico",
    latitude: 21.9125,
    longitude: -102.3115,
  },
];

export const INDIA_PRESETS: LocationPreset[] = [
  {
    city: "Hyderabad - HITEC City",
    address: "Cyber Towers, HITECH City, Madhapur, Hyderabad, Telangana 500081, India",
    latitude: 17.4504,
    longitude: 78.3808,
  },
  {
    city: "Hyderabad - Gachibowli",
    address: "Financial District, Nanakramguda, Gachibowli, Hyderabad, Telangana 500032, India",
    latitude: 17.4185,
    longitude: 78.3489,
  },
  {
    city: "Hyderabad - Madhapur",
    address: "Mindspace IT Park, Building No. 9, Madhapur, Hyderabad, Telangana 500081, India",
    latitude: 17.4375,
    longitude: 78.3842,
  },
  {
    city: "Hyderabad - Kondapur",
    address: "Botanical Garden Rd, Sri Ramnagar, Kondapur, Hyderabad, Telangana 500084, India",
    latitude: 17.4645,
    longitude: 78.3582,
  },
  {
    city: "Hyderabad - Jubilee Hills",
    address: "Road No. 36, Jubilee Hills, Hyderabad, Telangana 500033, India",
    latitude: 17.4312,
    longitude: 78.4072,
  },
  {
    city: "Hyderabad - Banjara Hills",
    address: "Road No. 12, Banjara Hills, Hyderabad, Telangana 500034, India",
    latitude: 17.4156,
    longitude: 78.4350,
  },
  {
    city: "Hyderabad - Begumpet",
    address: "Sardar Patel Rd, Prakash Nagar, Begumpet, Hyderabad, Telangana 500016, India",
    latitude: 17.4428,
    longitude: 78.4682,
  },
  {
    city: "Hyderabad - Kukatpally",
    address: "JNTU Road, KPHB Phase 1, Kukatpally, Hyderabad, Telangana 500072, India",
    latitude: 17.4938,
    longitude: 78.3985,
  },
  {
    city: "Hyderabad - Manikonda",
    address: "Puppalguda Main Rd, Manikonda, Hyderabad, Telangana 500089, India",
    latitude: 17.3982,
    longitude: 78.3750,
  },
  {
    city: "Hyderabad - Somajiguda",
    address: "Raj Bhavan Rd, Somajiguda, Hyderabad, Telangana 500082, India",
    latitude: 17.4250,
    longitude: 78.4580,
  },
];

export const SYMBIOSYS_PRESETS: LocationPreset[] = [
  {
    city: "Visakhapatnam - Madhurawada",
    address: "Plot No. 12, IT SEZ, Madhurawada, Visakhapatnam, AP 530048, India",
    latitude: 17.8185,
    longitude: 83.3512,
  },
  {
    city: "Visakhapatnam - Rushikonda",
    address: "Hill No. 3, Tech Park, Rushikonda, Visakhapatnam, AP 530045, India",
    latitude: 17.7836,
    longitude: 83.3824,
  },
  {
    city: "Visakhapatnam - Siripuram",
    address: "Waltair Main Rd, Siripuram, Visakhapatnam, AP 530003, India",
    latitude: 17.7215,
    longitude: 83.3158,
  },
  {
    city: "Visakhapatnam - MVP Colony",
    address: "Sector 3, MVP Colony, Visakhapatnam, AP 530017, India",
    latitude: 17.7392,
    longitude: 83.3340,
  },
  {
    city: "Visakhapatnam - Beach Road",
    address: "Dr NTR Beach Rd, Pandurangapuram, Visakhapatnam, AP 530003, India",
    latitude: 17.7128,
    longitude: 83.3245,
  },
  {
    city: "Visakhapatnam - Dwaraka Nagar",
    address: "2nd Lane, Dwaraka Nagar, Visakhapatnam, AP 530016, India",
    latitude: 17.7265,
    longitude: 83.3050,
  },
  {
    city: "Visakhapatnam - Gajuwaka",
    address: "High School Rd, Gajuwaka, Visakhapatnam, AP 530026, India",
    latitude: 17.6912,
    longitude: 83.2185,
  },
];

const UK_PRESETS: LocationPreset[] = [
  {
    city: "London",
    address: "100 Bishopsgate, London EC2N 4AG, United Kingdom",
    latitude: 51.5152,
    longitude: -0.0818,
  },
  {
    city: "Canary Wharf",
    address: "1 Canada Square, Canary Wharf, London E14 5AA, United Kingdom",
    latitude: 51.5050,
    longitude: -0.0195,
  },
  {
    city: "Holborn",
    address: "220 High Holborn, London WC1V 7BH, United Kingdom",
    latitude: 51.5173,
    longitude: -0.1206,
  },
];

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getRandomLocationData(
  locationName?: string | null,
  seed: string = "employee",
  itemIndex?: number
): LocationPreset {
  const key = (locationName || "").toLowerCase().trim();
  const hash = stringHash(seed || "default");

  let pool = USA_PRESETS;

  if (key === "symbiosys" || key.includes("symbiosys") || key.includes("vizag") || key.includes("visakhapatnam")) {
    pool = SYMBIOSYS_PRESETS;
  } else if (
    key === "india" ||
    key.includes("india") ||
    key.includes("hyderabad") ||
    key.includes("bengaluru") ||
    key.includes("bangalore") ||
    key.includes("chennai") ||
    key.includes("mumbai") ||
    key.includes("pune") ||
    key.includes("delhi") ||
    key.includes("kolkata")
  ) {
    pool = INDIA_PRESETS;
  } else if (key.includes("mexico") || key.includes("guadalajara") || key.includes("zapopan")) {
    pool = MEXICO_PRESETS;
  } else if (
    key.includes("portugal") ||
    key.includes("porto") ||
    key.includes("lisbon") ||
    key.includes("lisboa")
  ) {
    pool = PORTUGAL_PRESETS;
  } else if (key.includes("uk") || key.includes("london") || key.includes("united kingdom")) {
    pool = UK_PRESETS;
  } else if (key.includes("usa") || key.includes("united states") || key.includes("dallas")) {
    pool = USA_PRESETS;
  }

  const selectedIndex =
    typeof itemIndex === "number" && itemIndex >= 0
      ? itemIndex % pool.length
      : hash % pool.length;

  const base = pool[selectedIndex];

  return {
    city: base.city,
    address: base.address,
    latitude: base.latitude,
    longitude: base.longitude,
  };
}
