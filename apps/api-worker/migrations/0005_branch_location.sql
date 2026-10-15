-- Round 4 · Mini App marketplace: distance "Gần bạn" (only shown when the guest grants Zalo location).
ALTER TABLE branches ADD COLUMN lat REAL;
ALTER TABLE branches ADD COLUMN lng REAL;
UPDATE branches SET lat = 10.7743, lng = 106.7038 WHERE id = 'branch-pho-d1';
UPDATE branches SET lat = 10.7765, lng = 106.6880 WHERE id = 'branch-pho-d3';
UPDATE branches SET lat = 10.8016, lng = 106.6537 WHERE id = 'branch-clinic-tb';
UPDATE branches SET lat = 10.7837, lng = 106.6893 WHERE id = 'branch-cafe-d3';
