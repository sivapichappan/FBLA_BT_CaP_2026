-- ============================================================================
-- LocalLens v2 — demo seed (New York City), depth edition
--
-- ~45 real, well-known NYC *independent* businesses across food / retail /
-- services, concentrated downtown (Village, SoHo, LES, East Village) so the
-- map demos densely. Includes a month of BACKDATED activity — reviews, views,
-- favorites, redemptions — so trends, funnels, and analytics render instantly.
--
-- Conventions:
--   * Coordinates real-but-approximate; phones use the fictional 555-01xx range.
--   * Rows reference each other by NAME/USERNAME sub-selects (no hardcoded ids).
--   * All denormalized aggregates (avg rating, review counts, redemption
--     counts, trust scores) are RECOMPUTED at the end from the seeded rows —
--     the same invariants the app maintains transactionally at runtime.
--   * Timestamps are spread with deterministic (id % N) offsets — varied
--     enough for charts, reproducible across reseeds.
-- ============================================================================

-- ── Categories ───────────────────────────────────────────────────────────────
INSERT INTO categories (name) VALUES
  ('Coffee'), ('Cafe'), ('Bakery'), ('Restaurant'), ('Bar'), ('Food'),
  ('Bookstore'), ('Grocery'), ('Pharmacy'), ('Retail'), ('Dessert'),
  ('Barber'), ('Salon'), ('Fitness'), ('Florist'), ('Services')
ON CONFLICT (name) DO NOTHING;

-- ── Users: 3 demo accounts + 12 reviewer personas ───────────────────────────
-- demo_user / demodemo · demo_owner / ownerowner (owns 5) · admin / adminadmin
-- Personas reuse the demo_user hash; they never sign in.
INSERT INTO users (email, username, password_hash, role, default_lat, default_lng) VALUES
  ('admin@locallens.app', 'admin', '$2b$12$nLZiVE9u9Up27cMducBIKON1txcKybRzuFXTL1Pd7.NogoI2A8p76', 'admin', 40.7308, -73.9973),
  ('demo@locallens.app',  'demo_user',  '$2b$12$dJueR4Ebsnvg8wDignWq.eoqHJHtmeVWn0o2/r6P0bxEU7Y8Xd2Yq', 'user',  40.7308, -73.9973),
  ('owner@locallens.app', 'demo_owner', '$2b$12$61CgHOieDSO/Tr/RTJC4jOXaPP7rhCRfo0.wbTRoADyfYcSwGGCc6', 'owner', 40.7308, -73.9973),
  ('maya@example.com',  'maya_r',  '$2b$12$dJueR4Ebsnvg8wDignWq.eoqHJHtmeVWn0o2/r6P0bxEU7Y8Xd2Yq', 'user', 40.73, -73.99),
  ('james@example.com', 'james_k', '$2b$12$dJueR4Ebsnvg8wDignWq.eoqHJHtmeVWn0o2/r6P0bxEU7Y8Xd2Yq', 'user', 40.73, -73.99),
  ('priya@example.com', 'priya_s', '$2b$12$dJueR4Ebsnvg8wDignWq.eoqHJHtmeVWn0o2/r6P0bxEU7Y8Xd2Yq', 'user', 40.73, -73.99),
  ('leo@example.com',   'leo_m',   '$2b$12$dJueR4Ebsnvg8wDignWq.eoqHJHtmeVWn0o2/r6P0bxEU7Y8Xd2Yq', 'user', 40.73, -73.99),
  ('sofia@example.com', 'sofia_d', '$2b$12$dJueR4Ebsnvg8wDignWq.eoqHJHtmeVWn0o2/r6P0bxEU7Y8Xd2Yq', 'user', 40.73, -73.99),
  ('noah@example.com',  'noah_t',  '$2b$12$dJueR4Ebsnvg8wDignWq.eoqHJHtmeVWn0o2/r6P0bxEU7Y8Xd2Yq', 'user', 40.73, -73.99),
  ('ana@example.com',   'ana_v',   '$2b$12$dJueR4Ebsnvg8wDignWq.eoqHJHtmeVWn0o2/r6P0bxEU7Y8Xd2Yq', 'user', 40.72, -73.99),
  ('derek@example.com', 'derek_w', '$2b$12$dJueR4Ebsnvg8wDignWq.eoqHJHtmeVWn0o2/r6P0bxEU7Y8Xd2Yq', 'user', 40.72, -73.99),
  ('mei@example.com',   'mei_l',   '$2b$12$dJueR4Ebsnvg8wDignWq.eoqHJHtmeVWn0o2/r6P0bxEU7Y8Xd2Yq', 'user', 40.73, -74.00),
  ('sam@example.com',   'sam_o',   '$2b$12$dJueR4Ebsnvg8wDignWq.eoqHJHtmeVWn0o2/r6P0bxEU7Y8Xd2Yq', 'user', 40.73, -74.00),
  ('tessa@example.com', 'tessa_b', '$2b$12$dJueR4Ebsnvg8wDignWq.eoqHJHtmeVWn0o2/r6P0bxEU7Y8Xd2Yq', 'user', 40.72, -73.98),
  ('ravi@example.com',  'ravi_p',  '$2b$12$dJueR4Ebsnvg8wDignWq.eoqHJHtmeVWn0o2/r6P0bxEU7Y8Xd2Yq', 'user', 40.72, -73.98)
ON CONFLICT (email) DO NOTHING;

-- ── Businesses (45) ──────────────────────────────────────────────────────────
-- demo_owner owns the first five (rich analytics + cashier-mode demos).
INSERT INTO businesses (name, lat, lng, address, phone, price_level, is_independent, local_confidence, owner_id) VALUES
  -- demo_owner's five
  ('Caffè Reggio',            40.7300, -74.0006, '119 MacDougal St, New York, NY 10012', '(212) 555-0101', 2, TRUE, 0.96, (SELECT id FROM users WHERE username='demo_owner')),
  ('Joe''s Pizza',            40.7305, -74.0027, '7 Carmine St, New York, NY 10014',     '(212) 555-0102', 1, TRUE, 0.94, (SELECT id FROM users WHERE username='demo_owner')),
  ('Buvette',                 40.7330, -74.0029, '42 Grove St, New York, NY 10014',      '(212) 555-0103', 3, TRUE, 0.93, (SELECT id FROM users WHERE username='demo_owner')),
  ('Murray''s Cheese',        40.7314, -74.0033, '254 Bleecker St, New York, NY 10014',  '(212) 555-0112', 2, TRUE, 0.92, (SELECT id FROM users WHERE username='demo_owner')),
  ('McNally Jackson Books',   40.7244, -73.9967, '134 Prince St, New York, NY 10012',    '(212) 555-0114', 2, TRUE, 0.93, (SELECT id FROM users WHERE username='demo_owner')),
  -- food institutions
  ('Russ & Daughters',        40.7226, -73.9882, '179 E Houston St, New York, NY 10002', '(212) 555-0104', 2, TRUE, 0.97, NULL),
  ('Katz''s Delicatessen',    40.7223, -73.9874, '205 E Houston St, New York, NY 10002', '(212) 555-0105', 2, TRUE, 0.95, NULL),
  ('Veselka',                 40.7289, -73.9866, '144 Second Ave, New York, NY 10003',   '(212) 555-0106', 2, TRUE, 0.92, NULL),
  ('Ess-a-Bagel',             40.7325, -73.9826, '324 First Ave, New York, NY 10009',    '(212) 555-0107', 1, TRUE, 0.91, NULL),
  ('Levain Bakery',           40.7790, -73.9799, '167 W 74th St, New York, NY 10023',    '(212) 555-0108', 2, TRUE, 0.90, NULL),
  ('Dominique Ansel Bakery',  40.7246, -74.0030, '189 Spring St, New York, NY 10012',    '(212) 555-0109', 3, TRUE, 0.88, NULL),
  ('Prince Street Pizza',     40.7232, -73.9942, '27 Prince St, New York, NY 10012',     '(212) 555-0110', 1, TRUE, 0.93, NULL),
  ('Maman',                   40.7199, -73.9981, '239 Centre St, New York, NY 10013',    '(212) 555-0111', 2, TRUE, 0.86, NULL),
  ('John''s of Bleecker Street', 40.7316, -74.0036, '278 Bleecker St, New York, NY 10014', '(212) 555-0123', 2, TRUE, 0.93, NULL),
  ('Scarr''s Pizza',          40.7152, -73.9916, '35 Orchard St, New York, NY 10002',    '(212) 555-0124', 1, TRUE, 0.92, NULL),
  ('Via Carota',              40.7322, -74.0035, '51 Grove St, New York, NY 10014',      '(212) 555-0125', 3, TRUE, 0.92, NULL),
  ('Rubirosa',                40.7227, -73.9957, '235 Mulberry St, New York, NY 10012',  '(212) 555-0126', 2, TRUE, 0.91, NULL),
  ('Cafe Mogador',            40.7270, -73.9846, '101 St Marks Pl, New York, NY 10009',  '(212) 555-0127', 2, TRUE, 0.92, NULL),
  ('B&H Dairy',               40.7287, -73.9889, '127 Second Ave, New York, NY 10003',   '(212) 555-0128', 1, TRUE, 0.95, NULL),
  ('Superiority Burger',      40.7283, -73.9838, '119 Avenue A, New York, NY 10009',     '(212) 555-0129', 1, TRUE, 0.91, NULL),
  ('Thai Diner',              40.7194, -73.9943, '186 Mott St, New York, NY 10012',      '(212) 555-0130', 2, TRUE, 0.90, NULL),
  ('Yonah Schimmel Knish Bakery', 40.7224, -73.9891, '137 E Houston St, New York, NY 10002', '(212) 555-0131', 1, TRUE, 0.95, NULL),
  -- coffee
  ('Abraço',                  40.7273, -73.9851, '81 E 7th St, New York, NY 10003',      '(212) 555-0132', 2, TRUE, 0.94, NULL),
  ('Mud Coffee',              40.7290, -73.9879, '307 E 9th St, New York, NY 10003',     '(212) 555-0133', 1, TRUE, 0.93, NULL),
  ('Porto Rico Importing Co.', 40.7302, -74.0001, '201 Bleecker St, New York, NY 10012', '(212) 555-0134', 1, TRUE, 0.96, NULL),
  ('Saltwater Coffee',        40.7276, -73.9837, '345 E 12th St, New York, NY 10003',    '(212) 555-0135', 2, TRUE, 0.92, NULL),
  ('Tompkins Square Bagels',  40.7277, -73.9819, '165 Avenue A, New York, NY 10009',     '(212) 555-0136', 1, TRUE, 0.91, NULL),
  -- books, records, retail
  ('The Strand Book Store',   40.7332, -73.9907, '828 Broadway, New York, NY 10003',     '(212) 555-0113', 2, TRUE, 0.95, NULL),
  ('Books of Wonder',         40.7384, -73.9930, '42 W 17th St, New York, NY 10011',     '(212) 555-0115', 2, TRUE, 0.91, NULL),
  ('Three Lives & Company',   40.7345, -74.0009, '154 W 10th St, New York, NY 10014',    '(212) 555-0116', 2, TRUE, 0.94, NULL),
  ('Housing Works Bookstore', 40.7242, -73.9979, '126 Crosby St, New York, NY 10012',    '(212) 555-0137', 1, TRUE, 0.93, NULL),
  ('Generation Records',      40.7297, -74.0003, '210 Thompson St, New York, NY 10012',  '(212) 555-0138', 2, TRUE, 0.92, NULL),
  ('Fishs Eddy',              40.7386, -73.9890, '889 Broadway, New York, NY 10003',     '(212) 555-0139', 2, TRUE, 0.90, NULL),
  ('Casey Rubber Stamps',     40.7283, -73.9856, '322 E 11th St, New York, NY 10003',    '(212) 555-0140', 1, TRUE, 0.95, NULL),
  ('CW Aedes Perfumery',      40.7338, -74.0021, '7 Greenwich Ave, New York, NY 10014',  '(212) 555-0141', 3, TRUE, 0.90, NULL),
  -- groceries & provisions
  ('Kalustyan''s',            40.7430, -73.9819, '123 Lexington Ave, New York, NY 10016', '(212) 555-0118', 2, TRUE, 0.93, NULL),
  ('Economy Candy',           40.7187, -73.9876, '108 Rivington St, New York, NY 10002', '(212) 555-0142', 1, TRUE, 0.94, NULL),
  ('Di Palo''s Fine Foods',   40.7191, -73.9973, '200 Grand St, New York, NY 10013',     '(212) 555-0143', 2, TRUE, 0.95, NULL),
  ('Raffetto''s',             40.7259, -74.0011, '144 W Houston St, New York, NY 10012', '(212) 555-0144', 1, TRUE, 0.96, NULL),
  ('Astor Wines & Spirits',   40.7290, -73.9919, '399 Lafayette St, New York, NY 10003', '(212) 555-0145', 2, TRUE, 0.91, NULL),
  -- bars
  ('Old Town Bar',            40.7388, -73.9893, '45 E 18th St, New York, NY 10003',     '(212) 555-0146', 2, TRUE, 0.94, NULL),
  ('Ear Inn',                 40.7259, -74.0094, '326 Spring St, New York, NY 10013',    '(212) 555-0147', 2, TRUE, 0.94, NULL),
  -- services & misc
  ('C.O. Bigelow Apothecary', 40.7349, -73.9986, '414 Sixth Ave, New York, NY 10011',    '(212) 555-0117', 2, TRUE, 0.89, NULL),
  ('Fellow Barber',           40.7259, -73.9925, '5 Bleecker St, New York, NY 10012',    '(212) 555-0119', 2, TRUE, 0.85, NULL),
  ('Mark Fisher Fitness',     40.7530, -73.9970, '450 W 37th St, New York, NY 10018',    '(212) 555-0121', 3, TRUE, 0.84, NULL),
  ('L''Olivier Floral Atelier', 40.7385, -73.9820, '213 E 4th St, New York, NY 10009',   '(212) 555-0122', 2, TRUE, 0.87, NULL);

-- ── Business ↔ category links ────────────────────────────────────────────────
INSERT INTO business_categories (business_id, category_id)
SELECT b.id, c.id
FROM (VALUES
  ('Caffè Reggio','Coffee'), ('Caffè Reggio','Cafe'),
  ('Joe''s Pizza','Restaurant'), ('Joe''s Pizza','Food'),
  ('Buvette','Restaurant'), ('Buvette','Cafe'),
  ('Murray''s Cheese','Grocery'), ('Murray''s Cheese','Retail'), ('Murray''s Cheese','Food'),
  ('McNally Jackson Books','Bookstore'), ('McNally Jackson Books','Retail'),
  ('Russ & Daughters','Food'), ('Russ & Daughters','Grocery'),
  ('Katz''s Delicatessen','Restaurant'), ('Katz''s Delicatessen','Food'),
  ('Veselka','Restaurant'),
  ('Ess-a-Bagel','Bakery'), ('Ess-a-Bagel','Food'),
  ('Levain Bakery','Bakery'), ('Levain Bakery','Dessert'),
  ('Dominique Ansel Bakery','Bakery'), ('Dominique Ansel Bakery','Dessert'), ('Dominique Ansel Bakery','Cafe'),
  ('Prince Street Pizza','Restaurant'), ('Prince Street Pizza','Food'),
  ('Maman','Cafe'), ('Maman','Bakery'),
  ('John''s of Bleecker Street','Restaurant'), ('John''s of Bleecker Street','Food'),
  ('Scarr''s Pizza','Restaurant'), ('Scarr''s Pizza','Food'),
  ('Via Carota','Restaurant'),
  ('Rubirosa','Restaurant'), ('Rubirosa','Food'),
  ('Cafe Mogador','Restaurant'), ('Cafe Mogador','Cafe'),
  ('B&H Dairy','Restaurant'), ('B&H Dairy','Food'),
  ('Superiority Burger','Restaurant'), ('Superiority Burger','Food'),
  ('Thai Diner','Restaurant'),
  ('Yonah Schimmel Knish Bakery','Bakery'), ('Yonah Schimmel Knish Bakery','Food'), ('Yonah Schimmel Knish Bakery','Dessert'),
  ('Abraço','Coffee'), ('Abraço','Cafe'),
  ('Mud Coffee','Coffee'), ('Mud Coffee','Cafe'),
  ('Porto Rico Importing Co.','Coffee'), ('Porto Rico Importing Co.','Retail'),
  ('Saltwater Coffee','Coffee'), ('Saltwater Coffee','Cafe'),
  ('Tompkins Square Bagels','Bakery'), ('Tompkins Square Bagels','Food'),
  ('The Strand Book Store','Bookstore'), ('The Strand Book Store','Retail'),
  ('Books of Wonder','Bookstore'), ('Books of Wonder','Retail'),
  ('Three Lives & Company','Bookstore'), ('Three Lives & Company','Retail'),
  ('Housing Works Bookstore','Bookstore'), ('Housing Works Bookstore','Cafe'),
  ('Generation Records','Retail'),
  ('Fishs Eddy','Retail'),
  ('Casey Rubber Stamps','Retail'), ('Casey Rubber Stamps','Services'),
  ('CW Aedes Perfumery','Retail'),
  ('Kalustyan''s','Grocery'), ('Kalustyan''s','Retail'),
  ('Economy Candy','Dessert'), ('Economy Candy','Retail'),
  ('Di Palo''s Fine Foods','Grocery'), ('Di Palo''s Fine Foods','Food'),
  ('Raffetto''s','Grocery'), ('Raffetto''s','Food'),
  ('Astor Wines & Spirits','Grocery'), ('Astor Wines & Spirits','Retail'),
  ('Old Town Bar','Bar'), ('Old Town Bar','Restaurant'),
  ('Ear Inn','Bar'), ('Ear Inn','Restaurant'),
  ('C.O. Bigelow Apothecary','Pharmacy'), ('C.O. Bigelow Apothecary','Retail'),
  ('Fellow Barber','Barber'), ('Fellow Barber','Services'),
  ('Mark Fisher Fitness','Fitness'), ('Mark Fisher Fitness','Services'),
  ('L''Olivier Floral Atelier','Florist'), ('L''Olivier Floral Atelier','Services')
) AS v(bname, cname)
JOIN businesses b ON b.name = v.bname
JOIN categories c ON c.name = v.cname
ON CONFLICT DO NOTHING;

-- ── Hours for EVERY business, by category profile ────────────────────────────
-- Restaurants/bars: 11:00–22:00 daily · coffee/cafe/bakery: 07:30–18:00 daily ·
-- everything else: 10:00–19:00, closed Sunday.
INSERT INTO business_hours (business_id, day_of_week, open_time, close_time, is_closed)
SELECT b.id, d.dow,
  CASE
    WHEN EXISTS (SELECT 1 FROM business_categories bc JOIN categories c ON c.id = bc.category_id
                 WHERE bc.business_id = b.id AND c.name IN ('Restaurant','Bar')) THEN TIME '11:00'
    WHEN EXISTS (SELECT 1 FROM business_categories bc JOIN categories c ON c.id = bc.category_id
                 WHERE bc.business_id = b.id AND c.name IN ('Coffee','Cafe','Bakery')) THEN TIME '07:30'
    WHEN d.dow = 0 THEN NULL
    ELSE TIME '10:00'
  END,
  CASE
    WHEN EXISTS (SELECT 1 FROM business_categories bc JOIN categories c ON c.id = bc.category_id
                 WHERE bc.business_id = b.id AND c.name IN ('Restaurant','Bar')) THEN TIME '22:00'
    WHEN EXISTS (SELECT 1 FROM business_categories bc JOIN categories c ON c.id = bc.category_id
                 WHERE bc.business_id = b.id AND c.name IN ('Coffee','Cafe','Bakery')) THEN TIME '18:00'
    WHEN d.dow = 0 THEN NULL
    ELSE TIME '19:00'
  END,
  -- Only the "everything else" profile closes on Sunday.
  (d.dow = 0 AND NOT EXISTS (SELECT 1 FROM business_categories bc JOIN categories c ON c.id = bc.category_id
                             WHERE bc.business_id = b.id AND c.name IN ('Restaurant','Bar','Coffee','Cafe','Bakery')))
FROM businesses b
CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6)) AS d(dow)
ON CONFLICT (business_id, day_of_week) DO NOTHING;

-- ── Reviews ──────────────────────────────────────────────────────────────────
INSERT INTO reviews (business_id, user_id, rating, body)
SELECT b.id, u.id, v.rating, v.body
FROM (VALUES
  -- demo_owner's five (rich histories for the dashboard)
  ('Caffè Reggio','maya_r',5,'The original cappuccino in NYC and still the coziest corner in the Village.'),
  ('Caffè Reggio','james_k',4,'Old-world charm, strong espresso, no laptops cluttering the place.'),
  ('Caffè Reggio','priya_s',5,'Like stepping into 1927. A real neighborhood institution.'),
  ('Caffè Reggio','ana_v',5,'That marble counter and the espresso machine are pure history.'),
  ('Caffè Reggio','derek_w',4,'Great people-watching window. Cash-friendly, fast service.'),
  ('Caffè Reggio','tessa_b',4,'Perfect afternoon stop after browsing the Village bookshops.'),
  ('Joe''s Pizza','leo_m',5,'The benchmark classic slice. Foldable, perfect, gone in a minute.'),
  ('Joe''s Pizza','sofia_d',5,'Been coming for years. Still the best plain slice in the city.'),
  ('Joe''s Pizza','noah_t',4,'Always a line but it moves fast and the slice never disappoints.'),
  ('Joe''s Pizza','mei_l',5,'Late-night slice after a show — there is no better ritual.'),
  ('Joe''s Pizza','ravi_p',4,'Crispy, hot, cheap. Everything a slice joint should be.'),
  ('Buvette','maya_r',4,'Tiny, romantic, and the croque-monsieur is worth the squeeze.'),
  ('Buvette','demo_user',5,'Perfect West Village brunch. The espresso and pastries are lovely.'),
  ('Buvette','sam_o',4,'Get there early on weekends. The coq au vin is a quiet masterpiece.'),
  ('Murray''s Cheese','leo_m',5,'A Bleecker St cheese landmark. The staff actually know their stuff.'),
  ('Murray''s Cheese','ana_v',5,'Ask for a taste before you buy — they love to teach.'),
  ('Murray''s Cheese','tessa_b',4,'The cave-aged gruyère is worth every penny.'),
  ('McNally Jackson Books','demo_user',5,'Thoughtful curation and a genuinely great cafe in the back.'),
  ('McNally Jackson Books','james_k',4,'My favorite indie bookstore for browsing. Smart events too.'),
  ('McNally Jackson Books','mei_l',5,'The staff picks shelf has never steered me wrong.'),
  -- institutions
  ('Russ & Daughters','james_k',5,'A NYC appetizing institution since 1914. The lox is unmatched.'),
  ('Russ & Daughters','priya_s',5,'Fourth-generation family shop. You can taste the care.'),
  ('Russ & Daughters','leo_m',4,'Pricey but special-occasion worthy. Sturgeon is incredible.'),
  ('Katz''s Delicatessen','sofia_d',5,'Pastrami on rye, hand-carved, exactly as it should be.'),
  ('Katz''s Delicatessen','noah_t',4,'Touristy now but the pastrami earns every bit of the hype.'),
  ('Katz''s Delicatessen','derek_w',5,'Get the ticket, watch the carvers work. A NYC rite of passage.'),
  ('Veselka','demo_user',4,'24-hour pierogi and borscht in the East Village. A reliable classic.'),
  ('Veselka','maya_r',5,'Ukrainian comfort food that has anchored this block for decades.'),
  ('Ess-a-Bagel','james_k',5,'Big, chewy, fresh bagels. The line out the door tells you everything.'),
  ('Ess-a-Bagel','leo_m',4,'Get the everything with scallion cream cheese. No notes.'),
  ('Levain Bakery','priya_s',5,'Those cookies are a religious experience. Worth the UWS trip.'),
  ('Levain Bakery','sofia_d',5,'Crispy outside, gooey center. The chocolate chip walnut is a must.'),
  ('Dominique Ansel Bakery','noah_t',4,'Cronut hype aside, the DKA and kouign-amann are the real stars.'),
  ('Dominique Ansel Bakery','ana_v',5,'The frozen s''more alone justifies the SoHo detour.'),
  ('Prince Street Pizza','demo_user',5,'The pepperoni square (Spicy Spring) is the best in the city.'),
  ('Prince Street Pizza','james_k',4,'Crispy, cupped pepperoni, perfect char. Cash-only line moves fast.'),
  ('Maman','maya_r',4,'Lovely Provençal cafe — the nutty chocolate chip cookie is a standout.'),
  ('John''s of Bleecker Street','ravi_p',5,'Coal-fired pies since 1929. No slices, no shortcuts.'),
  ('John''s of Bleecker Street','sam_o',4,'The char on that crust is unbeatable. Cash only, worth it.'),
  ('Scarr''s Pizza','tessa_b',5,'Fresh-milled flour makes a difference you can actually taste.'),
  ('Scarr''s Pizza','mei_l',4,'Retro vibes, natural wine, and a seriously good plain slice.'),
  ('Via Carota','sofia_d',5,'The svizzerina is legendary for a reason. Worth any wait.'),
  ('Via Carota','derek_w',5,'Cacio e pepe perfection in the prettiest room in the Village.'),
  ('Rubirosa','noah_t',5,'The vodka pie is a Nolita rite of passage. Thin, crisp, perfect.'),
  ('Rubirosa','ana_v',4,'Family recipes that taste like Sunday dinner. Book ahead.'),
  ('Cafe Mogador','maya_r',5,'Moroccan brunch institution. The halloumi eggs are everything.'),
  ('Cafe Mogador','ravi_p',4,'Family-run since 1983 and you can feel it in the service.'),
  ('B&H Dairy','leo_m',5,'Challah french toast at the counter of a 1938 luncheonette. Magic.'),
  ('B&H Dairy','tessa_b',4,'The borscht and buttered challah combo never changes. Good.'),
  ('Superiority Burger','sam_o',5,'Veggie burgers so good carnivores line up. Gelato too.'),
  ('Superiority Burger','priya_s',4,'Inventive, cheap, delicious. The burnt broccoli salad slaps.'),
  ('Thai Diner','mei_l',5,'Thai disco fries and breakfast all day. Loud, fun, delicious.'),
  ('Thai Diner','james_k',4,'The Thai tea babka alone is worth the trip to Mott St.'),
  ('Yonah Schimmel Knish Bakery','derek_w',4,'A 1910 knishery still doing it right. Potato classic.'),
  ('Yonah Schimmel Knish Bakery','sofia_d',4,'Old-school LES survivor. Get the kasha knish.'),
  -- coffee
  ('Abraço','maya_r',5,'Tiny espresso bar with a devoted following. The olive oil cake!'),
  ('Abraço','noah_t',5,'No-frills espresso done with total conviction.'),
  ('Mud Coffee','ana_v',4,'Orange cups, strong coffee, East Village attitude since forever.'),
  ('Mud Coffee','sam_o',4,'The Mudslide is dangerous. In a good way.'),
  ('Porto Rico Importing Co.','james_k',5,'Family-owned roaster since 1907. The smell alone is worth it.'),
  ('Porto Rico Importing Co.','tessa_b',5,'Bins of beans, fair prices, staff who know every origin.'),
  ('Saltwater Coffee','mei_l',5,'Aussie-style flat whites that rival anything in Melbourne.'),
  ('Saltwater Coffee','leo_m',4,'Bright little shop, lovely banana bread, great cortado.'),
  ('Tompkins Square Bagels','ravi_p',5,'Hand-rolled, kettle-boiled, enormous. The French toast bagel!'),
  ('Tompkins Square Bagels','derek_w',4,'Creative cream cheeses and a line that moves quick.'),
  -- books, records, retail
  ('The Strand Book Store','priya_s',5,'18 miles of books. A New York treasure you can lose hours in.'),
  ('The Strand Book Store','sofia_d',5,'Independent since 1927. The rare-book room upstairs is magic.'),
  ('The Strand Book Store','noah_t',4,'Crowded but unbeatable selection and great staff picks.'),
  ('Books of Wonder','maya_r',5,'The best childrens bookstore in the city. Magical for kids.'),
  ('Three Lives & Company','leo_m',5,'Tiny, perfect West Village bookshop. Staff recs never miss.'),
  ('Three Lives & Company','mei_l',5,'The kind of bookstore that makes you want to read everything.'),
  ('Housing Works Bookstore','sam_o',5,'Used books, a cafe, and every dollar goes to a good cause.'),
  ('Housing Works Bookstore','ana_v',4,'Beautiful spiral staircases and genuinely cheap finds.'),
  ('Generation Records','tessa_b',4,'Punk and metal vinyl heaven in a Village basement.'),
  ('Generation Records','james_k',4,'Knowledgeable staff, fair used prices, proper record-shop energy.'),
  ('Fishs Eddy','derek_w',5,'Quirky NYC-themed dishware you will not find anywhere else.'),
  ('Fishs Eddy','priya_s',4,'Gift-shopping heaven. The skyline plates are iconic.'),
  ('Casey Rubber Stamps','ravi_p',5,'A tiny shop hand-making rubber stamps since 1979. Pure charm.'),
  ('CW Aedes Perfumery','sofia_d',5,'Niche fragrances and the most beautiful little shop interior.'),
  -- groceries & provisions
  ('Kalustyan''s','sofia_d',5,'Spice paradise. If they dont have it, it probably doesnt exist.'),
  ('Kalustyan''s','sam_o',5,'Three floors of every ingredient every cuisine ever needed.'),
  ('Economy Candy','mei_l',5,'Floor-to-ceiling candy since 1937. Inner child fully fed.'),
  ('Economy Candy','noah_t',4,'Nostalgia by the pound. The halvah selection is wild.'),
  ('Di Palo''s Fine Foods','ana_v',5,'Fifth-generation mozzarella and a wait that is always worth it.'),
  ('Di Palo''s Fine Foods','leo_m',5,'They treat every customer like family. The burrata!'),
  ('Raffetto''s','tessa_b',5,'Fresh-cut pasta since 1906. Watch them run the cutting machine.'),
  ('Raffetto''s','james_k',4,'The spinach fettuccine and a tub of marinara — dinner solved.'),
  ('Astor Wines & Spirits','derek_w',4,'Deep selection, honest staff picks, great natural wine wall.'),
  ('Astor Wines & Spirits','maya_r',4,'Free tastings and shelf notes that actually help.'),
  -- bars
  ('Old Town Bar','sam_o',5,'An 1892 saloon with the original everything. Burgers and history.'),
  ('Old Town Bar','ravi_p',4,'Wood, brass, and zero pretension. A proper old New York bar.'),
  ('Ear Inn','priya_s',5,'Drinking in a 1817 landmark house by the Hudson. Unbeatable.'),
  ('Ear Inn','noah_t',4,'Creaky, cozy, characterful. Great burger, better stories.'),
  -- services & misc
  ('C.O. Bigelow Apothecary','priya_s',4,'Americas oldest apothecary — old-school service, great house line.'),
  ('C.O. Bigelow Apothecary','mei_l',5,'The rose salve and lemon body cream are cult classics for a reason.'),
  ('Fellow Barber','noah_t',4,'Clean fades, friendly barbers, no fuss. Solid neighborhood shop.'),
  ('Fellow Barber','derek_w',4,'Consistent cuts and easy online booking.'),
  ('Mark Fisher Fitness','maya_r',5,'Ridiculously fun, welcoming gym. The community keeps me coming back.'),
  ('Mark Fisher Fitness','tessa_b',5,'Fitness that feels like joining a theater troupe. I love it here.'),
  ('L''Olivier Floral Atelier','james_k',5,'Stunning, architectural arrangements. My go-to for special occasions.'),
  ('L''Olivier Floral Atelier','ana_v',4,'Gorgeous work — call ahead for custom pieces.')
) AS v(bname, uname, rating, body)
JOIN businesses b ON b.name = v.bname
JOIN users u ON u.username = v.uname
ON CONFLICT (business_id, user_id) DO NOTHING;

-- ── Deals (10; one already expired to show lifecycle) ────────────────────────
INSERT INTO deals (business_id, title, discount_pct, per_user_limit, total_limit, starts_at, ends_at)
SELECT b.id, v.title, v.pct, 1, v.total, now() - INTERVAL '20 days', now() + (v.days_left || ' days')::interval
FROM (VALUES
  ('Caffè Reggio',           '10% off your first cappuccino',                 10, 200, '30'),
  ('Caffè Reggio',           'Espresso + cannoli pairing, 15% off',           15, 100, '14'),
  ('Joe''s Pizza',           'Two classic slices, 15% off',                   15, 500, '30'),
  ('Joe''s Pizza',           'Late-night slice special, 10% off after 10pm',  10, 300, '21'),
  ('Buvette',                'Free espresso with any brunch entrée',          20, 100, '25'),
  ('Murray''s Cheese',       '15% off any cheese board',                      15, 150, '30'),
  ('McNally Jackson Books',  '10% off staff picks',                           10, NULL, '40'),
  ('The Strand Book Store',  '15% off any used book',                         15, NULL, '35'),
  ('Economy Candy',          '10% off a pound of pick-and-mix',               10, 250, '28'),
  ('Scarr''s Pizza',         'Slice + soda combo, 12% off',                   12, 200, '18')
) AS v(bname, title, pct, total, days_left)
JOIN businesses b ON b.name = v.bname;

-- An expired deal (won't list as active; visible in owner analytics history).
INSERT INTO deals (business_id, title, discount_pct, per_user_limit, total_limit, starts_at, ends_at)
SELECT b.id, 'Spring opening special, 20% off', 20, 1, 50, now() - INTERVAL '45 days', now() - INTERVAL '2 days'
FROM businesses b WHERE b.name = 'Caffè Reggio';

-- ── Seeded redemptions (cashier-mode + funnel demo data) ─────────────────────
-- Mostly unverified (cashier can mark them used live); two pre-verified.
INSERT INTO deal_redemptions (deal_id, user_id, code, verified_at)
SELECT d.id, u.id, v.code, CASE WHEN v.verified THEN now() - INTERVAL '3 days' ELSE NULL END
FROM (VALUES
  ('10% off your first cappuccino',                'maya_r',  'CAFE1A2B', FALSE),
  ('10% off your first cappuccino',                'james_k', 'CAFE3C4D', TRUE),
  ('10% off your first cappuccino',                'tessa_b', 'CAFE5E6F', FALSE),
  ('Espresso + cannoli pairing, 15% off',          'ana_v',   'PAIR7A8B', FALSE),
  ('Two classic slices, 15% off',                  'leo_m',   'SLICE9AB', FALSE),
  ('Two classic slices, 15% off',                  'mei_l',   'SLICE1CD', TRUE),
  ('Two classic slices, 15% off',                  'demo_user','SLICE2EF', FALSE),
  ('Late-night slice special, 10% off after 10pm', 'ravi_p',  'NIGHT3AB', FALSE),
  ('Free espresso with any brunch entrée',         'sofia_d', 'BRUN4CDE', FALSE),
  ('15% off any cheese board',                     'derek_w', 'CHEZ5FAB', FALSE),
  ('10% off staff picks',                          'sam_o',   'BOOK6CDE', FALSE),
  ('15% off any used book',                        'noah_t',  'STRD7FAB', FALSE)
) AS v(deal_title, uname, code, verified)
JOIN deals d ON d.title = v.deal_title
JOIN users u ON u.username = v.uname;

-- ── Seeded favorites (snapshots built from the live rows) ────────────────────
INSERT INTO favorites (user_id, business_ref, snapshot_json)
SELECT u.id, b.id::text,
       json_build_object(
         'name', b.name, 'source', 'local', 'address', b.address,
         'average_rating', b.average_rating, 'review_count', b.review_count,
         'price_level', b.price_level, 'local_badge', 'verified_local',
         'lat', b.lat, 'lng', b.lng,
         'categories', COALESCE((SELECT json_agg(c.name) FROM business_categories bc
                                 JOIN categories c ON c.id = bc.category_id
                                 WHERE bc.business_id = b.id), '[]'::json)
       )
FROM (VALUES
  ('demo_user','Caffè Reggio'), ('demo_user','The Strand Book Store'), ('demo_user','Abraço'),
  ('maya_r','Caffè Reggio'), ('maya_r','Cafe Mogador'), ('maya_r','Three Lives & Company'),
  ('james_k','Joe''s Pizza'), ('james_k','Porto Rico Importing Co.'), ('james_k','Murray''s Cheese'),
  ('priya_s','Levain Bakery'), ('priya_s','Russ & Daughters'), ('priya_s','Ear Inn'),
  ('leo_m','Joe''s Pizza'), ('leo_m','B&H Dairy'), ('leo_m','Di Palo''s Fine Foods'),
  ('sofia_d','Via Carota'), ('sofia_d','Katz''s Delicatessen'), ('sofia_d','CW Aedes Perfumery'),
  ('noah_t','Rubirosa'), ('noah_t','Economy Candy'), ('noah_t','The Strand Book Store'),
  ('ana_v','Di Palo''s Fine Foods'), ('ana_v','Murray''s Cheese'), ('ana_v','Caffè Reggio'),
  ('derek_w','Fishs Eddy'), ('derek_w','Old Town Bar'), ('derek_w','Katz''s Delicatessen'),
  ('mei_l','Saltwater Coffee'), ('mei_l','Thai Diner'), ('mei_l','McNally Jackson Books'),
  ('sam_o','Superiority Burger'), ('sam_o','Housing Works Bookstore'), ('sam_o','Kalustyan''s'),
  ('tessa_b','Scarr''s Pizza'), ('tessa_b','Raffetto''s'), ('tessa_b','Mark Fisher Fitness'),
  ('ravi_p','Tompkins Square Bagels'), ('ravi_p','John''s of Bleecker Street'), ('ravi_p','Casey Rubber Stamps')
) AS v(uname, bname)
JOIN users u ON u.username = v.uname
JOIN businesses b ON b.name = v.bname
ON CONFLICT (user_id, business_ref) DO NOTHING;

-- ── Seeded detail-page views (the funnel's top) ──────────────────────────────
-- Owner businesses get 60–130 views spread across ~3 weeks; everyone else a
-- lighter trickle. generate_series + per-business offsets = varied but
-- deterministic.
INSERT INTO business_views (business_id, user_id, viewed_at)
SELECT b.id, NULL, now() - (gs * INTERVAL '5 hours') - ((b.id % 7) * INTERVAL '3 hours')
FROM businesses b
CROSS JOIN LATERAL generate_series(1, 60 + (b.id % 5) * 17) AS gs
WHERE b.owner_id IS NOT NULL;

INSERT INTO business_views (business_id, user_id, viewed_at)
SELECT b.id, NULL, now() - (gs * INTERVAL '26 hours') - ((b.id % 11) * INTERVAL '2 hours')
FROM businesses b
CROSS JOIN LATERAL generate_series(1, 8 + (b.id % 13)) AS gs
WHERE b.owner_id IS NULL;

-- ── Backdate activity so trends/funnels have a month of history ─────────────
-- Deterministic (id % N) offsets: varied, reproducible, no randomness.
UPDATE reviews          SET created_at  = now() - ((id % 28) * INTERVAL '1 day') - ((id % 11) * INTERVAL '2 hours');
UPDATE favorites        SET created_at  = now() - ((id % 24) * INTERVAL '1 day') - ((id % 7)  * INTERVAL '3 hours');
UPDATE deal_redemptions SET redeemed_at = now() - ((id % 18) * INTERVAL '1 day') - ((id % 5)  * INTERVAL '4 hours');

-- ── Recompute every denormalized aggregate from the seeded rows ──────────────
UPDATE businesses b
SET average_rating = COALESCE(s.avg_rating, 0),
    review_count   = COALESCE(s.cnt, 0)
FROM (SELECT business_id, AVG(rating)::real AS avg_rating, COUNT(*) AS cnt
      FROM reviews GROUP BY business_id) s
WHERE b.id = s.business_id;

UPDATE deals SET redemption_count =
  (SELECT COUNT(*) FROM deal_redemptions WHERE deal_id = deals.id);

-- Trust scores from the same rules the app applies at runtime:
-- review +10 · redemption +5 · favorite +2.
UPDATE users SET trust_score =
  (SELECT COUNT(*) FROM reviews          WHERE user_id = users.id) * 10 +
  (SELECT COUNT(*) FROM deal_redemptions WHERE user_id = users.id) * 5 +
  (SELECT COUNT(*) FROM favorites        WHERE user_id = users.id) * 2;
