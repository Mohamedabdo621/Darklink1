-- DARKLINK — بيانات أولية: باقات الجواهر وكتالوج الهدايا
-- الأسعار تُدار من الجداول دي (إعدادات المتجر) بدون تعديل كود.

insert into public.gem_packages (name_key, gems, price_egp, sort) values
    ('starter',  100,  49.00,  1),
    ('popular',  500,  199.00, 2),
    ('premium',  1000, 349.00, 3),
    ('ultimate', 5000, 1499.00, 4)
on conflict do nothing;

insert into public.gifts (name_key, asset, price_gems, sort) values
    ('rose',            'rose.jpg',            10,   1),
    ('heart',           'heart.jpg',           25,   2),
    ('teddy_bear',      'teddy-bear.jpg',      50,   3),
    ('star',            'star.jpg',            75,   4),
    ('magic_gem',       'magic-gem.jpg',       100,  5),
    ('crystal_cluster', 'crystal-cluster.jpg', 150,  6),
    ('diamond',         'diamond.jpg',         250,  7),
    ('crown',           'crown.jpg',           500,  8),
    ('treasure_chest',  'treasure-chest.jpg',  1000, 9)
on conflict (name_key) do nothing;
