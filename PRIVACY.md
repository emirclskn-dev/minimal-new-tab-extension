# Gizlilik

ECLABS Launch hesap, analytics, reklam veya takip sistemi kullanmaz. Kategoriler, siteler, görünüm, tema ve ayarlar yalnızca tarayıcının `chrome.storage.local` alanında cihazda tutulur.

Arka plan araması yalnızca kullanıcı açıkça arama yaptığında yapılandırılmış Cloudflare Worker'a gönderilir. Worker arama metnini Pexels API'ye iletir. Cloudflare, isteği iletmek ve kötüye kullanımı hız sınırıyla önlemek için bağlantı IP adresini işler; ECLABS Launch bu adresi kaydetmez veya kullanıcı profili oluşturmaz. Seçilen görsel dosyası cihazda saklanmaz; yalnızca görsel URL'si, fotoğrafçı adı, fotoğrafçı bağlantısı ve Pexels fotoğraf bağlantısı yerel depoda tutulur. Yeni sekmeler kayıtlı uzak URL'yi kullanır ve otomatik arama isteği yapmaz.

Brave/Chrome site ve yer imi aktarımı yalnızca kullanıcı işlemiyle, isteğe bağlı izin verildikten sonra çalışır. JSON ve HTML içe aktarma dosyaları cihaz üzerinde işlenir.

Veriler ayarlardan dışa aktarılabilir. Uzantı kaldırıldığında tarayıcı yerel uzantı verilerini silebilir. Pexels ve Cloudflare işlemleri kendi gizlilik politikalarına tabidir.
