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
      about_label: 'Sobre nos',
      about_title: 'Uma historia que nasce da terra',
      about_p1: 'Encravado entre a Mata Atlantica e o oceano, o Sitio Labareda e um refugio onde a arte encontra a roca. Em Serra Grande, no coracao da Costa do Cacau, cultivamos cacau, historias e uma hospitalidade que nasce da simplicidade da vida no campo.',
      about_p2: 'Aqui, o ritmo e ditado pelo canto dos passaros, pelo cheiro do cacau fermentando e pela brisa que vem do mar. Cada canto do sitio carrega a estetica da xilogravura nordestina \u2014 rustica, forte, verdadeira. Venha viver a experiencia Labareda.',
      about_detail_label: 'Localizacao',
      about_detail_value: 'Serra Grande, Urucuca \u2014 BA',
      book_label: 'Hospedagem',
      book_title: 'Sua estadia na roca',
      book_description: 'Quartos rusticos com alma artistica, cercados pela Mata Atlantica. Cafe da manha com frutas do sitio, cacau fresco e o som do rio ao fundo. Uma experiencia sensorial completa.',
      book_cta: 'RESERVE AGORA',
      radio_label: 'Radio',
      radio_title: 'Labareda Radio',
      radio_subtitle: 'A trilha sonora da roca. Ouca nossas playlists curadas.',
      radio_aviso: 'Para ouvir as playlists completas, faca login no seu Spotify. Sem login, apenas previews de 30 segundos estao disponiveis.',
      radio_abrir_spotify: 'Abrir Spotify',
      shop_label: 'Loja',
      shop_title: 'Da roca pra voce',
      shop_subtitle: 'Produtos artesanais feitos com amor e materia-prima local.',
      shop_cat_all: 'Todos',
      shop_badge_new: 'Novo',
      shop_view: 'Ver produto',
      journal_label: 'Diario',
      journal_title: 'Journal',
      journal_subtitle: 'Historias, imagens e cronicas da vida na roca.',
      contact_label: 'Contato',
      contact_title: 'Fale conosco',
      contact_description: 'Tem perguntas, quer reservar ou simplesmente dizer ola? Escreva pra gente.',
      contact_address_label: 'Endereco',
      contact_address_value: 'Rodovia BA-001, KM 39,5<br>Serra Grande, Urucuca/BA<br>Brasil',
      contact_social_label: 'Social',
      contact_name_label: 'Nome',
      contact_email_label: 'E-mail',
      contact_message_label: 'Mensagem',
      contact_submit: 'Enviar mensagem',
      contact_success: 'Mensagem enviada com sucesso!',
      contact_error: 'Erro ao enviar. Tente novamente.',
      footer_location: 'Serra Grande, Costa do Cacau, Bahia, Brasil',
      footer_nav_title: 'Navegacao',
      footer_contact_title: 'Contato',
      footer_rights: 'Todos os direitos reservados.',
      cookie_text: 'Usamos cookies para melhorar sua experiencia. Ao continuar navegando, voce concorda com nossa politica de privacidade.',
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
      about_label: 'About us',
      about_title: 'A story born from the land',
      about_p1: 'Nestled between the Atlantic Forest and the ocean, Sitio Labareda is a retreat where art meets the countryside. In Serra Grande, at the heart of the Cocoa Coast, we cultivate cacao, stories, and a hospitality born from the simplicity of rural life.',
      about_p2: 'Here, the rhythm is set by birdsong, the scent of fermenting cacao, and the breeze from the sea. Every corner of the estate carries the aesthetics of northeastern woodcut art \u2014 rustic, strong, true. Come live the Labareda experience.',
      about_detail_label: 'Location',
      about_detail_value: 'Serra Grande, Urucuca \u2014 BA',
      book_label: 'Accommodation',
      book_title: 'Your countryside stay',
      book_description: 'Rustic rooms with artistic soul, surrounded by the Atlantic Forest. Breakfast with farm-fresh fruits, fresh cacao, and the sound of the river in the background. A complete sensory experience.',
      book_cta: 'BOOK NOW',
      radio_label: 'Radio',
      radio_title: 'Labareda Radio',
      radio_subtitle: 'The soundtrack of the countryside. Listen to our curated playlists.',
      radio_aviso: 'To listen to full playlists, log in to your Spotify. Without login, only 30-second previews are available.',
      radio_abrir_spotify: 'Open Spotify',
      shop_label: 'Shop',
      shop_title: 'From the farm to you',
      shop_subtitle: 'Handcrafted products made with love and local ingredients.',
      shop_cat_all: 'All',
      shop_badge_new: 'New',
      shop_view: 'View product',
      journal_label: 'Journal',
      journal_title: 'Journal',
      journal_subtitle: 'Stories, images, and chronicles of life on the farm.',
      contact_label: 'Contact',
      contact_title: 'Get in touch',
      contact_description: 'Have questions, want to book, or just say hello? Drop us a line.',
      contact_address_label: 'Address',
      contact_address_value: 'Highway BA-001, KM 39.5<br>Serra Grande, Urucuca/BA<br>Brazil',
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
