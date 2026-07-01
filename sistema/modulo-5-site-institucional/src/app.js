/* ==========================================================================
   SITIO LABAREDA — app.js
   Interactions: menu, scroll, i18n, gallery, shop filter, cookie banner
   + Supabase data layer (produtos, journal, radio, contato, config)
   ========================================================================== */

(function () {
  'use strict';

  /* ========================================================================
     SUPABASE CONFIG & HELPERS
     ======================================================================== */
  var SUPABASE_URL = 'https://wgvqiguebiqhubhtwfhz.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndndnFpZ3VlYmlxaHViaHR3Zmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjE1NTIsImV4cCI6MjA5ODQ5NzU1Mn0.FEALNU6X_sXkJlaXlfLizkzGUI8kD6TbIU88LmAyn7w';

  function supabaseFetch(tabela, query) {
    query = query || '';
    return fetch(SUPABASE_URL + '/rest/v1/' + tabela + query, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
      },
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase fetch error: ' + resp.status);
      return resp.json();
    });
  }

  function supabaseInsert(tabela, data) {
    return fetch(SUPABASE_URL + '/rest/v1/' + tabela, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(data),
    }).then(function (resp) {
      return resp.ok;
    });
  }

  /* ---------- DOM References ---------- */
  var header = document.getElementById('site-header');
  var menuToggle = document.getElementById('menu-toggle');
  var mobileMenu = document.getElementById('mobile-menu');
  var langToggle = document.getElementById('lang-toggle');
  var cookieBanner = document.getElementById('cookie-banner');
  var cookieAccept = document.getElementById('cookie-accept');
  var galleryTrack = document.getElementById('book-gallery-track');
  var galleryDots = document.querySelectorAll('.gallery-dot');
  var shopCatBtns = document.querySelectorAll('.shop-cat-btn');
  var productCards = document.querySelectorAll('.product-card');
  var mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

  /* ---------- State ---------- */
  var currentLang = 'pt';
  var currentSlide = 0;
  var galleryInterval = null;
  var totalSlides = 5;

  /* Supabase data cache */
  var siteConfig = {};
  var loadedProducts = [];
  var loadedJournalPosts = [];
  var loadedPlaylists = [];

  /* ==========================================================================
     TRANSLATIONS
     ========================================================================== */
  var translations = {
    pt: {
      skip: 'Pular para o conteudo',
      nav_about: 'ABOUT',
      nav_book: 'BOOK',
      nav_radio: 'RADIO',
      nav_shop: 'SHOP',
      nav_journal: 'JOURNAL',
      nav_contact: 'CONTACT',
      hero_location: 'Serra Grande \u00b7 Costa do Cacau \u00b7 Bahia',
      hero_headline: 'N\u00e3o \u00e9 um quarto com vista. \u00c9 uma vida por alguns dias.',
      hero_subheadline: 'Um santu\u00e1rio de ro\u00e7a e arte no cora\u00e7\u00e3o da Costa do Cacau. Mata viva, lagoas cristalinas, praia logo ali \u2014 e o caf\u00e9 da manh\u00e3 que a terra deu de manh\u00e3.',
      hero_cta_book: 'Reservar sua estada',
      hero_cta_whatsapp: 'Falar no WhatsApp',
      hero_micro_1: 'Reserva direta',
      hero_micro_2: 'Caf\u00e9 da ro\u00e7a incluso',
      hero_micro_3: 'Poucas unidades',
      experience_label: 'Aqui o dia tem outro ritmo',
      experience_title: 'O que voc\u00ea vai viver',
      pillar_1_title: 'A ro\u00e7a acorda primeiro',
      pillar_1_text: 'Caf\u00e9 da manh\u00e3 colhido a poucos passos da sua rede.',
      pillar_2_title: '\u00c1gua doce e salgada',
      pillar_2_text: 'Lagoas cristalinas e praias selvagens de Serra Grande, Itacar\u00e9 e Mara\u00fa.',
      pillar_3_title: 'Arte que nasce aqui',
      pillar_3_text: 'O Est\u00fadio Tartaruga revela, tinge e imprime \u00e0 m\u00e3o.',
      pillar_4_title: 'Calor de verdade',
      pillar_4_text: 'Poucas unidades, aten\u00e7\u00e3o que \u00e9 gente, n\u00e3o protocolo.',
      about_label: 'A terra',
      about_title: 'A terra aqui n\u00e3o \u00e9 paisagem \u2014 \u00e9 despensa, \u00e9 rem\u00e9dio, \u00e9 come\u00e7o de tudo.',
      about_p1: 'Nossa agrofloresta \u00e9 um organismo vivo no meio da Mata Atl\u00e2ntica. \u00c9 dela que vem a fruta do seu caf\u00e9, o cheiro do nosso creme, a cor que vira arte. Quando voc\u00ea caminha entre o cacau, est\u00e1 caminhando dentro da fonte.',
      about_p2: 'Sem cen\u00e1rio. Sem fachada. S\u00f3 o que se vive.',
      about_detail_label: 'Localiza\u00e7\u00e3o',
      about_detail_value: 'Serra Grande, Uru\u00e7uca \u2014 BA',
      book_label: 'Hospedagem',
      book_title: 'Sua data est\u00e1 esperando.',
      book_description: 'Escolha quando quer viver a ro\u00e7a e a arte. Poucas unidades, aten\u00e7\u00e3o de verdade \u2014 os melhores per\u00edodos costumam fechar cedo.',
      book_cta: 'Ver disponibilidade e reservar',
      book_cta_whatsapp: 'Prefere conversar? Chame no WhatsApp',
      radio_label: 'R\u00e1dio',
      radio_title: 'Labareda Radio',
      radio_subtitle: 'A trilha sonora da ro\u00e7a. Ou\u00e7a nossas playlists curadas.',
      radio_aviso: 'Para ouvir as playlists completas, fa\u00e7a login no seu Spotify. Sem login, apenas previews de 30 segundos est\u00e3o dispon\u00edveis.',
      radio_abrir_spotify: 'Abrir Spotify',
      shop_label: 'Loja',
      shop_title: 'Leve um peda\u00e7o para casa',
      shop_subtitle: 'Produtos artesanais feitos com amor e mat\u00e9ria-prima da regi\u00e3o.',
      shop_cat_all: 'Todos',
      shop_badge_new: 'Novo',
      shop_view: 'Ver produto',
      journal_label: 'Di\u00e1rio',
      journal_title: 'Di\u00e1rio da Ro\u00e7a',
      journal_subtitle: 'Hist\u00f3rias, imagens e cr\u00f4nicas da vida na ro\u00e7a.',
      testimonials_label: 'Depoimentos',
      testimonials_title: 'Quem j\u00e1 viveu, conta',
      testimonial_1_quote: '\u201CChegamos para ficar dois dias e ficamos cinco. O caf\u00e9 da manh\u00e3 com frutas colhidas na hora, o sil\u00eancio da mata, a arte por todo canto \u2014 n\u00e3o d\u00e1 vontade de ir embora.\u201D',
      testimonial_1_name: 'Carolina & Pedro',
      testimonial_1_origin: 'S\u00e3o Paulo, SP',
      testimonial_2_quote: '\u201CViemos procurando praias e encontramos um universo. A caminhada na agrofloresta, as estampas feitas \u00e0 m\u00e3o, o calor dos anfitri\u00f5es \u2014 isso \u00e9 a Bahia de verdade.\u201D',
      testimonial_2_name: 'Lukas & Sofia',
      testimonial_2_origin: 'Berlim, Alemanha',
      testimonial_3_quote: '\u201COs cosm\u00e9ticos naturais s\u00e3o incr\u00edveis \u2014 comprei tudo. Mas o que levo de verdade \u00e9 a sensa\u00e7\u00e3o de ter vivido num lugar que faz sentido.\u201D',
      testimonial_3_name: 'Marina R.',
      testimonial_3_origin: 'Rio de Janeiro, RJ',
      faq_label: 'D\u00favidas frequentes',
      faq_title: 'Perguntas que a gente sempre ouve',
      faq_q1: 'Como fa\u00e7o a reserva?',
      faq_a1: 'A reserva \u00e9 direta, sem intermedi\u00e1rios. Voc\u00ea pode usar nosso sistema online ou falar diretamente no WhatsApp. Respondemos r\u00e1pido e com aten\u00e7\u00e3o de verdade.',
      faq_q2: 'O caf\u00e9 da manh\u00e3 est\u00e1 inclu\u00eddo?',
      faq_a2: 'Sim. Caf\u00e9 da ro\u00e7a com frutas colhidas a poucos passos da sua rede, p\u00e3es caseiros, sucos naturais e o melhor do cacau. Tudo fresco, tudo da terra.',
      faq_q3: 'Qual a dist\u00e2ncia da praia?',
      faq_a3: 'Estamos em Serra Grande, a poucos minutos de praias selvagens e lagoas cristalinas. Itacar\u00e9 e Mara\u00fa tamb\u00e9m s\u00e3o destinos pr\u00f3ximos para passeios de dia.',
      faq_q4: 'Posso visitar o Est\u00fadio Tartaruga?',
      faq_a4: 'Com certeza. O est\u00fadio \u00e9 o cora\u00e7\u00e3o criativo do s\u00edtio \u2014 serigrafia, fotografia anal\u00f3gica, arte manual. H\u00f3spedes podem visitar e participar de atividades quando dispon\u00edveis.',
      faq_q5: 'Voc\u00eas vendem os produtos online?',
      faq_a5: 'Sim! Vestu\u00e1rio, artes do Est\u00fadio Tartaruga, cosm\u00e9ticos naturais e alimentos da ro\u00e7a. Voc\u00ea pode comprar pela loja no site ou pedir pelo WhatsApp.',
      faq_q6: '\u00c9 bom para crian\u00e7as?',
      faq_a6: 'As crian\u00e7as amam. Animais, trilhas, frutas no p\u00e9, oficinas de arte. \u00c9 uma experi\u00eancia educativa e sensorial que elas nunca esquecem.',
      contact_label: 'Contato',
      contact_title: 'Fale conosco',
      contact_description: 'Estamos na Serra Grande, Costa do Cacau, sul da Bahia. Reserva direta, sem intermedi\u00e1rios, com aten\u00e7\u00e3o nossa do in\u00edcio ao fim.',
      contact_whatsapp_cta: 'Falar no WhatsApp',
      contact_address_label: 'Endere\u00e7o',
      contact_address_value: 'Rodovia BA-001, KM 39,5<br>Serra Grande, Uru\u00e7uca/BA<br>Brasil',
      contact_social_label: 'Social',
      contact_name_label: 'Nome',
      contact_email_label: 'E-mail',
      contact_message_label: 'Mensagem',
      contact_submit: 'Enviar mensagem',
      contact_success: 'Mensagem enviada com sucesso!',
      contact_error: 'Erro ao enviar. Tente novamente.',
      footer_location: 'Serra Grande, Costa do Cacau, Bahia, Brasil',
      footer_nav_title: 'Navega\u00e7\u00e3o',
      footer_contact_title: 'Contato',
      footer_badge: 'Reserva direta \u00b7 Sem intermedi\u00e1rios',
      footer_rights: 'Todos os direitos reservados.',
      cookie_text: 'Usamos cookies para melhorar sua experi\u00eancia. Ao continuar navegando, voc\u00ea concorda com nossa pol\u00edtica de privacidade.',
      cookie_accept: 'Aceitar',
    },
    en: {
      skip: 'Skip to content',
      nav_about: 'ABOUT',
      nav_book: 'BOOK',
      nav_radio: 'RADIO',
      nav_shop: 'SHOP',
      nav_journal: 'JOURNAL',
      nav_contact: 'CONTACT',
      hero_location: 'Serra Grande \u00b7 Cocoa Coast \u00b7 Bahia',
      hero_headline: 'It\u2019s not a room with a view. It\u2019s a life for a few days.',
      hero_subheadline: 'A sanctuary of farm and art in the heart of Brazil\u2019s Cocoa Coast. Living forest, crystal lagoons, beach just around the bend \u2014 and breakfast the land gave this morning.',
      hero_cta_book: 'Book your stay',
      hero_cta_whatsapp: 'Chat on WhatsApp',
      hero_micro_1: 'Direct booking',
      hero_micro_2: 'Farm breakfast included',
      hero_micro_3: 'Limited units',
      experience_label: 'The day has a different rhythm here',
      experience_title: 'What you\u2019ll live',
      pillar_1_title: 'The farm wakes up first',
      pillar_1_text: 'Breakfast harvested just a few steps from your hammock.',
      pillar_2_title: 'Fresh water and salt water',
      pillar_2_text: 'Crystal lagoons and wild beaches of Serra Grande, Itacar\u00e9 and Mara\u00fa.',
      pillar_3_title: 'Art born right here',
      pillar_3_text: 'Est\u00fadio Tartaruga reveals, dyes and prints by hand.',
      pillar_4_title: 'Real warmth',
      pillar_4_text: 'Few units, attention that is human, not protocol.',
      about_label: 'The land',
      about_title: 'The land here isn\u2019t scenery \u2014 it\u2019s pantry, medicine, the beginning of everything.',
      about_p1: 'Our agroforest is a living organism in the heart of the Atlantic Forest. It\u2019s where the fruit in your coffee comes from, the scent of our cream, the color that becomes art. When you walk among the cacao, you\u2019re walking inside the source.',
      about_p2: 'No set. No facade. Just what is lived.',
      about_detail_label: 'Location',
      about_detail_value: 'Serra Grande, Uru\u00e7uca \u2014 BA',
      book_label: 'Accommodation',
      book_title: 'Your date is waiting.',
      book_description: 'Choose when you want to live the farm and the art. Few units, real attention \u2014 the best periods tend to close early.',
      book_cta: 'See availability and book',
      book_cta_whatsapp: 'Prefer to talk? Chat on WhatsApp',
      radio_label: 'Radio',
      radio_title: 'Labareda Radio',
      radio_subtitle: 'The soundtrack of the countryside. Listen to our curated playlists.',
      radio_aviso: 'To listen to full playlists, log in to your Spotify. Without login, only 30-second previews are available.',
      radio_abrir_spotify: 'Open Spotify',
      shop_label: 'Shop',
      shop_title: 'Take a piece home',
      shop_subtitle: 'Handcrafted products made with love and local ingredients.',
      shop_cat_all: 'All',
      shop_badge_new: 'New',
      shop_view: 'View product',
      journal_label: 'Journal',
      journal_title: 'Farm Journal',
      journal_subtitle: 'Stories, images, and chronicles of life on the farm.',
      testimonials_label: 'Testimonials',
      testimonials_title: 'Those who lived it, tell it',
      testimonial_1_quote: '\u201CWe came for two days and stayed five. Breakfast with fruit picked on the spot, the silence of the forest, art everywhere \u2014 you just don\u2019t want to leave.\u201D',
      testimonial_1_name: 'Carolina & Pedro',
      testimonial_1_origin: 'S\u00e3o Paulo, Brazil',
      testimonial_2_quote: '\u201CWe came looking for beaches and found a universe. The agroforest walk, the handmade prints, the warmth of the hosts \u2014 this is the real Bahia.\u201D',
      testimonial_2_name: 'Lukas & Sofia',
      testimonial_2_origin: 'Berlin, Germany',
      testimonial_3_quote: '\u201CThe natural cosmetics are incredible \u2014 I bought everything. But what I really take away is the feeling of having lived in a place that makes sense.\u201D',
      testimonial_3_name: 'Marina R.',
      testimonial_3_origin: 'Rio de Janeiro, Brazil',
      faq_label: 'FAQ',
      faq_title: 'Questions we always hear',
      faq_q1: 'How do I make a reservation?',
      faq_a1: 'Booking is direct, no middlemen. You can use our online system or chat directly on WhatsApp. We respond quickly with real attention.',
      faq_q2: 'Is breakfast included?',
      faq_a2: 'Yes. Farm breakfast with fruit picked steps from your hammock, homemade bread, fresh juices and the best of cacao. Everything fresh, everything from the land.',
      faq_q3: 'How far is the beach?',
      faq_a3: 'We\u2019re in Serra Grande, minutes from wild beaches and crystal lagoons. Itacar\u00e9 and Mara\u00fa are also nearby for day trips.',
      faq_q4: 'Can I visit Est\u00fadio Tartaruga?',
      faq_a4: 'Absolutely. The studio is the creative heart of the farm \u2014 screen printing, analog photography, handmade art. Guests can visit and join activities when available.',
      faq_q5: 'Do you sell products online?',
      faq_a5: 'Yes! Clothing, Est\u00fadio Tartaruga art, natural cosmetics and farm foods. Buy through the shop on the site or order via WhatsApp.',
      faq_q6: 'Is it good for children?',
      faq_a6: 'Children love it. Animals, trails, fruit from the tree, art workshops. An educational and sensory experience they never forget.',
      contact_label: 'Contact',
      contact_title: 'Get in touch',
      contact_description: 'We\u2019re in Serra Grande, Cocoa Coast, southern Bahia. Direct booking, no middlemen, with our attention from start to finish.',
      contact_whatsapp_cta: 'Chat on WhatsApp',
      contact_address_label: 'Address',
      contact_address_value: 'Highway BA-001, KM 39.5<br>Serra Grande, Uru\u00e7uca/BA<br>Brazil',
      contact_social_label: 'Social',
      contact_name_label: 'Name',
      contact_email_label: 'Email',
      contact_message_label: 'Message',
      contact_submit: 'Send message',
      contact_success: 'Message sent successfully!',
      contact_error: 'Error sending. Please try again.',
      footer_location: 'Serra Grande, Cocoa Coast, Bahia, Brazil',
      footer_nav_title: 'Navigation',
      footer_contact_title: 'Contact',
      footer_badge: 'Direct booking \u00b7 No middlemen',
      footer_rights: 'All rights reserved.',
      cookie_text: 'We use cookies to improve your experience. By continuing to browse, you agree to our privacy policy.',
      cookie_accept: 'Accept',
    },
  };

  /* Placeholder translations for form inputs */
  var placeholders = {
    pt: {
      contact_name_placeholder: 'Seu nome',
      contact_email_placeholder: 'seu@email.com',
      contact_message_placeholder: 'Sua mensagem...',
    },
    en: {
      contact_name_placeholder: 'Your name',
      contact_email_placeholder: 'your@email.com',
      contact_message_placeholder: 'Your message...',
    },
  };

  /* ==========================================================================
     1. HEADER SCROLL EFFECT
     ========================================================================== */
  function handleHeaderScroll() {
    if (window.scrollY > 80) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }

  /* ==========================================================================
     2. MOBILE MENU
     ========================================================================== */
  function toggleMobileMenu() {
    var isOpen = mobileMenu.classList.contains('open');

    if (isOpen) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  }

  function openMobileMenu() {
    mobileMenu.classList.add('open');
    menuToggle.setAttribute('aria-expanded', 'true');
    menuToggle.setAttribute('aria-label', 'Fechar menu');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileMenu() {
    mobileMenu.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Abrir menu');
    document.body.style.overflow = '';
  }

  /* Close menu on nav link click */
  mobileNavLinks.forEach(function (link) {
    link.addEventListener('click', closeMobileMenu);
  });

  /* Close menu on Escape key */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
      closeMobileMenu();
      menuToggle.focus();
    }
  });

  /* ==========================================================================
     3. LANGUAGE TOGGLE
     ========================================================================== */
  function switchLanguage(lang) {
    currentLang = lang;
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';

    /* Update toggle UI */
    langToggle.querySelectorAll('.lang-option').forEach(function (opt) {
      opt.classList.toggle('active', opt.dataset.lang === lang);
    });

    /* Translate text elements */
    var dict = translations[lang];
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (dict[key] !== undefined) {
        el.innerHTML = dict[key];
      }
    });

    /* Translate placeholders */
    var ph = placeholders[lang];
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (ph[key] !== undefined) {
        el.placeholder = ph[key];
      }
    });

    /* Re-render dynamic content with new language */
    if (loadedProducts.length > 0) renderProducts(loadedProducts);
    if (loadedJournalPosts.length > 0) renderJournal(loadedJournalPosts);
    if (loadedPlaylists.length > 0) renderRadio(loadedPlaylists);
  }

  langToggle.addEventListener('click', function (e) {
    var opt = e.target.closest('.lang-option');
    if (opt && opt.dataset.lang) {
      switchLanguage(opt.dataset.lang);
    }
  });

  /* ==========================================================================
     4. SCROLL REVEAL (IntersectionObserver)
     ========================================================================== */
  function initScrollReveal() {
    var reveals = document.querySelectorAll('.reveal');

    if (!('IntersectionObserver' in window)) {
      /* Fallback: show everything */
      reveals.forEach(function (el) { el.classList.add('revealed'); });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    );

    reveals.forEach(function (el) { observer.observe(el); });
  }

  /* Re-init scroll reveal for dynamically added elements */
  function refreshScrollReveal() {
    var unrevealed = document.querySelectorAll('.reveal:not(.revealed)');
    if (!('IntersectionObserver' in window)) {
      unrevealed.forEach(function (el) { el.classList.add('revealed'); });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    );

    unrevealed.forEach(function (el) { observer.observe(el); });
  }

  /* ==========================================================================
     5. BOOK GALLERY SLIDESHOW
     ========================================================================== */
  function goToSlide(index) {
    currentSlide = index;
    if (galleryTrack) {
      galleryTrack.style.transform = 'translateX(-' + (index * 100) + '%)';
    }

    galleryDots.forEach(function (dot, i) {
      dot.classList.toggle('active', i === index);
      dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });
  }

  function nextSlide() {
    goToSlide((currentSlide + 1) % totalSlides);
  }

  function startGalleryAutoplay() {
    galleryInterval = setInterval(nextSlide, 4000);
  }

  function stopGalleryAutoplay() {
    clearInterval(galleryInterval);
  }

  galleryDots.forEach(function (dot) {
    dot.addEventListener('click', function () {
      stopGalleryAutoplay();
      goToSlide(parseInt(this.dataset.slide, 10));
      startGalleryAutoplay();
    });
  });

  /* Touch/swipe support for gallery */
  (function () {
    var startX = 0;
    var isDragging = false;

    if (!galleryTrack) return;

    galleryTrack.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
      isDragging = true;
      stopGalleryAutoplay();
    }, { passive: true });

    galleryTrack.addEventListener('touchend', function (e) {
      if (!isDragging) return;
      isDragging = false;
      var diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) {
          goToSlide(Math.min(currentSlide + 1, totalSlides - 1));
        } else {
          goToSlide(Math.max(currentSlide - 1, 0));
        }
      }
      startGalleryAutoplay();
    }, { passive: true });
  })();

  /* ==========================================================================
     6. SHOP — DYNAMIC (Supabase)
     ========================================================================== */

  function getProductHue(categorySlug) {
    var hueMap = {
      'vestuario': 15,
      'artes': 40,
      'cosmeticos': 130,
      'alimentos': 20,
    };
    return hueMap[categorySlug] || 15;
  }

  function renderProducts(produtos) {
    var shopGrid = document.getElementById('shop-grid');
    var catContainer = document.querySelector('.shop-categories');
    if (!shopGrid) return;

    /* Build category buttons from real data */
    var categories = [];
    var categoryMap = {};
    produtos.forEach(function (p) {
      if (p.categorias && p.categorias.slug && !categoryMap[p.categorias.slug]) {
        categoryMap[p.categorias.slug] = {
          slug: p.categorias.slug,
          nome_pt: p.categorias.nome_pt,
          nome_en: p.categorias.nome_en,
          icone: p.categorias.icone || '',
        };
        categories.push(categoryMap[p.categorias.slug]);
      }
    });

    if (catContainer && categories.length > 0) {
      var allLabel = currentLang === 'pt' ? 'Todos' : 'All';
      var catHTML = '<button class="shop-cat-btn active" role="tab" aria-selected="true" data-category="all">' + allLabel + '</button>';
      categories.forEach(function (cat) {
        var label = currentLang === 'pt' ? cat.nome_pt : cat.nome_en;
        catHTML += '<button class="shop-cat-btn" role="tab" aria-selected="false" data-category="' + cat.slug + '">'
          + (cat.icone ? cat.icone + ' ' : '') + label + '</button>';
      });
      catContainer.innerHTML = catHTML;

      /* Re-bind category filter */
      var newBtns = catContainer.querySelectorAll('.shop-cat-btn');
      newBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var cat = this.dataset.category;
          newBtns.forEach(function (b) {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
          });
          this.classList.add('active');
          this.setAttribute('aria-selected', 'true');

          var cards = shopGrid.querySelectorAll('.product-card');
          cards.forEach(function (card) {
            if (cat === 'all' || card.dataset.category === cat) {
              card.classList.remove('hidden');
            } else {
              card.classList.add('hidden');
            }
          });
        });
      });
    }

    /* Build product cards */
    var gridHTML = '';
    var delays = ['', ' reveal--delay-1', ' reveal--delay-2', ' reveal--delay-3'];
    produtos.forEach(function (p, idx) {
      var catSlug = p.categorias ? p.categorias.slug : 'geral';
      var catName = p.categorias
        ? (currentLang === 'pt' ? p.categorias.nome_pt : p.categorias.nome_en)
        : '';
      var productName = currentLang === 'pt' ? (p.nome_pt || p.nome) : (p.nome_en || p.nome_pt || p.nome);
      var price = p.preco
        ? 'R$ ' + parseFloat(p.preco).toFixed(2).replace('.', ',')
        : '';
      var hue = getProductHue(catSlug);
      var delayClass = delays[idx % 4];
      var badgeLabel = currentLang === 'pt' ? 'Novo' : 'New';
      var viewLabel = currentLang === 'pt' ? 'Ver produto' : 'View product';

      var imageHTML;
      if (p.imagem_url) {
        imageHTML = '<img src="' + p.imagem_url + '" alt="' + productName + '" class="product-img" loading="lazy">';
      } else {
        imageHTML = '<div class="product-image-placeholder" style="--product-hue: ' + hue + ';"></div>';
      }

      gridHTML += '<article class="product-card reveal' + delayClass + '" data-category="' + catSlug + '">'
        + '<div class="product-image">'
        + imageHTML
        + (p.destaque ? '<span class="product-badge">' + badgeLabel + '</span>' : '')
        + '</div>'
        + '<div class="product-info">'
        + '<span class="product-category">' + catName + '</span>'
        + '<h3 class="product-name">' + productName + '</h3>'
        + (price ? '<p class="product-price">' + price + '</p>' : '')
        + '<a href="' + (p.link_compra || '#') + '" class="product-link" ' + (p.link_compra ? 'target="_blank" rel="noopener noreferrer"' : '') + '>' + viewLabel + '</a>'
        + '</div>'
        + '</article>';
    });

    shopGrid.innerHTML = gridHTML;
    refreshScrollReveal();
  }

  function loadProducts() {
    supabaseFetch('produtos', '?ativo=eq.true&select=*,categorias(nome_pt,nome_en,slug,icone)&order=destaque.desc,created_at.desc')
      .then(function (data) {
        if (data && data.length > 0) {
          loadedProducts = data;
          renderProducts(data);
        }
      })
      .catch(function (err) {
        console.warn('Failed to load products from Supabase:', err.message);
        /* Keep static fallback */
      });
  }

  /* ==========================================================================
     6b. SHOP CATEGORY FILTER (static fallback)
     ========================================================================== */
  shopCatBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var cat = this.dataset.category;

      /* Update active button */
      shopCatBtns.forEach(function (b) {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      this.classList.add('active');
      this.setAttribute('aria-selected', 'true');

      /* Filter products */
      productCards.forEach(function (card) {
        if (cat === 'all' || card.dataset.category === cat) {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });
    });
  });

  /* ==========================================================================
     7. JOURNAL — DYNAMIC (Supabase)
     ========================================================================== */

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    var months_pt = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    var months_en = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var months = currentLang === 'pt' ? months_pt : months_en;

    var day = d.getDate().toString().padStart(2, '0');
    var month = months[d.getMonth()];
    var year = d.getFullYear();
    return day + ' ' + month + ' ' + year;
  }

  function renderJournal(posts) {
    var journalGrid = document.querySelector('.journal-grid');
    if (!journalGrid) return;

    var gridHTML = '';
    var delays = ['', ' reveal--delay-1', ' reveal--delay-2', ' reveal--delay-3'];
    var hues = [130, 15, 200, 45, 100, 350, 80, 260];

    posts.forEach(function (post, idx) {
      var title = currentLang === 'pt' ? (post.titulo_pt || post.titulo) : (post.titulo_en || post.titulo_pt || post.titulo);
      var excerpt = currentLang === 'pt' ? (post.resumo_pt || post.resumo) : (post.resumo_en || post.resumo_pt || post.resumo);
      var date = formatDate(post.published_at || post.created_at);
      var isoDate = post.published_at || post.created_at || '';
      var delayClass = delays[idx % 4];

      /* First post is large, 5th is wide */
      var sizeClass = '';
      if (idx === 0) sizeClass = ' journal-card--large';
      else if (idx === 4) sizeClass = ' journal-card--wide';

      var imageHTML;
      if (post.imagem_capa) {
        imageHTML = '<img src="' + post.imagem_capa + '" alt="' + title + '" class="journal-img" loading="lazy">';
      } else {
        var hue = hues[idx % hues.length];
        var sat = 30 + (idx * 5) % 20;
        imageHTML = '<div class="journal-image-placeholder" style="--journal-hue: ' + hue + '; --journal-sat: ' + sat + '%;"></div>';
      }

      gridHTML += '<article class="journal-card' + sizeClass + ' reveal' + delayClass + '" data-journal-idx="' + idx + '" onclick="window.__abrirJournalPost(' + idx + ')">'
        + '<div class="journal-card-image">' + imageHTML + '</div>'
        + '<div class="journal-card-content">'
        + '<time class="journal-date" datetime="' + isoDate.substring(0, 10) + '">' + date + '</time>'
        + '<h3 class="journal-card-title">' + title + '</h3>'
        + (excerpt ? '<p class="journal-card-excerpt">' + excerpt + '</p>' : '')
        + '</div>'
        + '</article>';
    });

    journalGrid.innerHTML = gridHTML;
    refreshScrollReveal();
  }

  function loadJournal() {
    supabaseFetch('journal_posts', '?publicado=eq.true&select=*&order=destaque.desc,published_at.desc')
      .then(function (data) {
        if (data && data.length > 0) {
          loadedJournalPosts = data;
          renderJournal(data);
        }
      })
      .catch(function (err) {
        console.warn('Failed to load journal from Supabase:', err.message);
      });
  }

  /* ==========================================================================
     8. RADIO — DYNAMIC (Supabase)
     ========================================================================== */

  function renderRadio(playlists) {
    var radioGrid = document.querySelector('.radio-grid');
    if (!radioGrid) return;

    var vinylColors = ['var(--terracota)', 'var(--verde)', 'var(--dourado)', 'var(--areia)'];
    var delays = [' reveal--delay-1', ' reveal--delay-2', ' reveal--delay-3', ' reveal--delay-4'];
    var gridHTML = '';

    playlists.forEach(function (pl, idx) {
      var title = pl.nome || pl.titulo_pt || pl.titulo || 'Playlist';
      var desc = pl.descricao || pl.descricao_pt || '';
      var num = (idx + 1).toString().padStart(2, '0');
      var vinylColor = vinylColors[idx % vinylColors.length];
      var delayClass = delays[idx % delays.length];

      var embedHTML = '';
      if (pl.spotify_embed_url || pl.spotify_url) {
        var embedSrc = pl.spotify_embed_url || pl.spotify_url;
        /* Convert regular Spotify URL to embed URL if needed */
        if (embedSrc.indexOf('/embed/') === -1 && embedSrc.indexOf('open.spotify.com') !== -1) {
          embedSrc = embedSrc.replace('open.spotify.com/', 'open.spotify.com/embed/');
        }
        if (embedSrc.indexOf('?') === -1) {
          embedSrc += '?utm_source=generator&theme=0';
        }
        embedHTML = '<div class="radio-embed">'
          + '<iframe title="' + title + '" style="border-radius:12px" '
          + 'src="' + embedSrc + '" '
          + 'width="100%" height="480" frameBorder="0" '
          + 'allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" '
          + 'loading="lazy"></iframe>'
          + '</div>';
      }

      gridHTML += '<div class="radio-card reveal' + delayClass + '">'
        + '<div class="radio-vinyl" aria-hidden="true">'
        + '<div class="vinyl-disc">'
        + '<div class="vinyl-label" style="--vinyl-color: ' + vinylColor + ';"><span>' + num + '</span></div>'
        + '</div>'
        + '</div>'
        + '<h3 class="radio-card-title">' + title + '</h3>'
        + '<p class="radio-card-desc">' + (desc || '') + '</p>'
        + embedHTML
        + '</div>';
    });

    radioGrid.innerHTML = gridHTML;
    refreshScrollReveal();
  }

  function loadRadio() {
    supabaseFetch('playlists', '?ativo=eq.true&select=*&order=ordem.asc')
      .then(function (data) {
        if (data && data.length > 0) {
          loadedPlaylists = data;
          renderRadio(data);
        }
      })
      .catch(function (err) {
        console.warn('Failed to load playlists from Supabase:', err.message);
      });
  }

  /* ==========================================================================
     9. SITE CONFIG (Supabase)
     ========================================================================== */

  function loadSiteConfig() {
    supabaseFetch('site_config', '?select=chave,valor')
      .then(function (data) {
        if (!data || data.length === 0) return;

        data.forEach(function (row) {
          siteConfig[row.chave] = row.valor;
        });

        /* Apply airbnb_url to BOOK NOW button */
        if (siteConfig.airbnb_url) {
          var bookBtn = document.querySelector('.section--book .btn--primary');
          if (bookBtn) {
            bookBtn.href = siteConfig.airbnb_url;
          }
        }

        /* Apply instagram_url */
        if (siteConfig.instagram_url) {
          var igLinks = document.querySelectorAll('.contact-social, .footer-social');
          igLinks.forEach(function (link) {
            link.href = siteConfig.instagram_url;
          });
        }

        /* Apply about_video_url if present (for future hero video) */
        if (siteConfig.about_video_url) {
          var heroPlaceholder = document.querySelector('.hero-video-placeholder');
          if (heroPlaceholder && siteConfig.about_video_url) {
            var video = document.createElement('video');
            video.autoplay = true;
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            video.src = siteConfig.about_video_url;
            heroPlaceholder.parentNode.replaceChild(video, heroPlaceholder);
          }
        }
      })
      .catch(function (err) {
        console.warn('Failed to load site config:', err.message);
      });
  }

  /* ==========================================================================
     10. CONTACT FORM — Supabase POST
     ========================================================================== */

  function showToast(message, isError) {
    /* Remove existing toast */
    var existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'toast-notification' + (isError ? ' toast--error' : ' toast--success');
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    document.body.appendChild(toast);

    /* Trigger reflow then add visible class */
    toast.offsetHeight; // eslint-disable-line no-unused-expressions
    toast.classList.add('toast--visible');

    setTimeout(function () {
      toast.classList.remove('toast--visible');
      setTimeout(function () { toast.remove(); }, 400);
    }, 4000);
  }

  var contactForm = document.getElementById('contact-form');

  contactForm.addEventListener('submit', function (e) {
    e.preventDefault();

    var nameInput = document.getElementById('contact-name');
    var emailInput = document.getElementById('contact-email');
    var messageInput = document.getElementById('contact-message');

    var name = nameInput.value.trim();
    var email = emailInput.value.trim();
    var message = messageInput.value.trim();

    if (!name || !email || !message) return;

    /* Disable button while sending */
    var submitBtn = contactForm.querySelector('button[type="submit"]');
    var originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = currentLang === 'pt' ? 'Enviando...' : 'Sending...';

    supabaseInsert('mensagens_contato', {
      nome: name,
      email: email,
      mensagem: message,
    })
      .then(function (ok) {
        if (ok) {
          showToast(translations[currentLang].contact_success, false);
          contactForm.reset();
        } else {
          showToast(translations[currentLang].contact_error, true);
        }
      })
      .catch(function () {
        showToast(translations[currentLang].contact_error, true);
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      });
  });

  /* ==========================================================================
     11. COOKIE BANNER
     ========================================================================== */
  function initCookieBanner() {
    if (localStorage.getItem('labareda-cookies-accepted')) {
      return;
    }

    /* Show banner after a short delay */
    setTimeout(function () {
      cookieBanner.classList.add('visible');
    }, 1500);
  }

  cookieAccept.addEventListener('click', function () {
    localStorage.setItem('labareda-cookies-accepted', 'true');
    cookieBanner.classList.add('hiding');
    cookieBanner.classList.remove('visible');

    setTimeout(function () {
      cookieBanner.style.display = 'none';
    }, 600);
  });

  /* ==========================================================================
     12. SMOOTH SCROLL FOR ANCHOR LINKS
     ========================================================================== */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var targetId = this.getAttribute('href');
      if (targetId === '#' || targetId === '#airbnb') return;

      var target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();
      var headerOffset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height'), 10) || 72;

      window.scrollTo({
        top: target.offsetTop - headerOffset,
        behavior: 'smooth',
      });
    });
  });

  /* ==========================================================================
     13. ACTIVE NAV HIGHLIGHT
     ========================================================================== */
  function initActiveNav() {
    var sections = document.querySelectorAll('section[id]');
    var navLinks = document.querySelectorAll('.nav-link');

    if (!('IntersectionObserver' in window)) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var id = entry.target.id;
            navLinks.forEach(function (link) {
              link.classList.toggle('active', link.getAttribute('href') === '#' + id);
            });
          }
        });
      },
      { threshold: 0.3, rootMargin: '-20% 0px -50% 0px' }
    );

    sections.forEach(function (section) { observer.observe(section); });
  }

  /* ==========================================================================
     INITIALIZATION
     ========================================================================== */
  function init() {
    /* Scroll listener (throttled via rAF) */
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          handleHeaderScroll();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });

    /* Initial header check */
    handleHeaderScroll();

    /* Mobile menu */
    menuToggle.addEventListener('click', toggleMobileMenu);

    /* Scroll reveal animations */
    initScrollReveal();

    /* Gallery autoplay */
    startGalleryAutoplay();

    /* Active nav */
    initActiveNav();

    /* Cookie banner */
    initCookieBanner();

    /* ===== Load Supabase data ===== */
    loadSiteConfig();
    loadProducts();
    loadJournal();
    loadRadio();
  }

  /* ==========================================================================
     MINI PLAYER — barra fixa no topo quando na seção Radio
     ========================================================================== */
  (function initMiniPlayer() {
    var miniPlayer = document.getElementById('mini-player');
    var miniTexto = document.getElementById('mini-player-texto');
    var btnIr = document.getElementById('mini-player-ir');
    var btnClose = document.getElementById('mini-player-close');
    if (!miniPlayer) return;

    var playerVisivel = false;
    var playerFechado = false;

    // Mostrar mini player quando o usuário sai da seção Radio
    var radioSection = document.getElementById('radio');
    if (radioSection) {
      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            // Usuário está vendo a seção Radio
            miniPlayer.classList.remove('visivel');
            playerVisivel = false;
            // Atualizar texto com primeira playlist
            if (loadedPlaylists.length > 0) {
              miniTexto.textContent = 'Tocando: ' + (loadedPlaylists[0].nome || 'Labareda Radio');
            }
          } else if (!playerFechado && loadedPlaylists.length > 0) {
            // Usuário saiu da seção Radio — mostrar mini player
            miniPlayer.style.display = '';
            setTimeout(function() {
              miniPlayer.classList.add('visivel');
              playerVisivel = true;
            }, 100);
          }
        });
      }, { threshold: 0.1 });
      observer.observe(radioSection);
    }

    if (btnIr) {
      btnIr.addEventListener('click', function() {
        document.getElementById('radio').scrollIntoView({ behavior: 'smooth' });
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', function() {
        miniPlayer.classList.remove('visivel');
        playerFechado = true;
      });
    }
  })();

  /* ==========================================================================
     JOURNAL MODAL — abrir post completo
     ========================================================================== */
  window.__abrirJournalPost = function(idx) {
    var post = loadedJournalPosts[idx];
    if (!post) return;

    var modal = document.getElementById('journal-modal');
    var imgContainer = document.getElementById('journal-modal-image');
    var titleEl = document.getElementById('journal-modal-title');
    var dateEl = document.getElementById('journal-modal-date');
    var contentEl = document.getElementById('journal-modal-content');
    var tagsEl = document.getElementById('journal-modal-tags');

    var title = currentLang === 'pt' ? (post.titulo_pt || post.titulo) : (post.titulo_en || post.titulo_pt);
    var content = currentLang === 'pt' ? (post.conteudo_pt || post.conteudo) : (post.conteudo_en || post.conteudo_pt);
    var date = formatDate(post.published_at || post.created_at);

    titleEl.textContent = title || 'Sem titulo';
    dateEl.textContent = date;
    contentEl.textContent = content || 'Conteudo em breve...';

    if (post.imagem_capa) {
      imgContainer.innerHTML = '<img src="' + post.imagem_capa + '" alt="' + (title || '') + '">';
    } else {
      imgContainer.innerHTML = '<div class="journal-modal__image--placeholder"></div>';
    }

    if (post.tags && post.tags.length > 0) {
      tagsEl.innerHTML = post.tags.map(function(t) {
        return '<span class="journal-modal__tag">#' + t + '</span>';
      }).join('');
    } else {
      tagsEl.innerHTML = '';
    }

    modal.classList.add('aberto');
    document.body.style.overflow = 'hidden';
  };

  /* Fechar modal */
  document.addEventListener('click', function(e) {
    var modal = document.getElementById('journal-modal');
    if (e.target.id === 'journal-modal-close' || e.target.id === 'journal-modal') {
      modal.classList.remove('aberto');
      document.body.style.overflow = '';
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var modal = document.getElementById('journal-modal');
      if (modal && modal.classList.contains('aberto')) {
        modal.classList.remove('aberto');
        document.body.style.overflow = '';
      }
    }
  });

  /* Run on DOMContentLoaded or immediately if already loaded */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
