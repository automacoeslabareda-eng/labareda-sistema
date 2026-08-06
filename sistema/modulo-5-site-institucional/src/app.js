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

  function supabaseInsertReturning(tabela, data) {
    return fetch(SUPABASE_URL + '/rest/v1/' + tabela, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(data),
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase insert error: ' + resp.status);
      return resp.json();
    });
  }

  function supabaseUpsert(tabela, data, onConflict) {
    // on_conflict diz ao Supabase em qual coluna resolver duplicados (ex: email).
    // Sem isso, e-mail repetido gera erro 409 (Conflict).
    var url = SUPABASE_URL + '/rest/v1/' + tabela + (onConflict ? '?on_conflict=' + encodeURIComponent(onConflict) : '');
    return fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify(data),
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase upsert error: ' + resp.status);
      return resp.json();
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
      nav_about: 'SOBRE',
      nav_book: 'RESERVAR',
      nav_radio: 'R\u00c1DIO',
      nav_shop: 'LOJA',
      nav_journal: 'DI\u00c1RIO',
      nav_contact: 'CONTATO',
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
      radio_aviso: 'Ou\u00e7a nossas playlists completas! Acesse o Spotify, salve na sua biblioteca e leve a trilha sonora da Labareda para onde quiser.',
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
      cart_title: 'Carrinho',
      cart_empty: 'Seu carrinho est\u00e1 vazio.',
      cart_subtotal: 'Subtotal',
      cart_checkout: 'Finalizar Compra',
      cart_continue: 'Continuar Comprando',
      cart_remove: 'Remover',
      product_qty: 'Quantidade',
      product_add_cart: 'Adicionar ao Carrinho',
      product_added: 'Produto adicionado ao carrinho!',
      product_out_of_stock: 'Produto esgotado',
      product_in_stock: 'Em estoque',
      product_low_stock: 'Restam poucas unidades',
      checkout_step1_title: 'Dados Pessoais',
      checkout_step2_title: 'Endere\u00e7o de Entrega',
      checkout_step3_title: 'Resumo do Pedido',
      checkout_name: 'Nome completo',
      checkout_email: 'E-mail',
      checkout_phone: 'Telefone',
      checkout_optional: '(opcional)',
      checkout_street: 'Rua',
      checkout_number: 'N\u00famero',
      checkout_complement: 'Complemento',
      checkout_neighborhood: 'Bairro',
      checkout_city: 'Cidade',
      checkout_state: 'Estado',
      checkout_shipping: 'Frete',
      checkout_select_state: 'Selecione o estado para calcular o frete.',
      checkout_next: 'Continuar',
      checkout_back: 'Voltar',
      checkout_confirm: 'Confirmar Pedido',
      checkout_success_title: 'Pedido Confirmado!',
      checkout_success_msg: 'Voc\u00ea receber\u00e1 um e-mail com os detalhes do pedido. O pagamento ser\u00e1 processado em breve.',
      checkout_success_close: 'Fechar',
      checkout_subtotal: 'Subtotal',
      checkout_shipping_label: 'Frete',
      checkout_total: 'Total',
      checkout_order_number: 'Pedido #',
      checkout_fill_fields: 'Preencha todos os campos obrigat\u00f3rios.',
      checkout_select_shipping: 'Selecione uma op\u00e7\u00e3o de frete.',
      checkout_error: 'Erro ao processar pedido. Tente novamente.',
      checkout_sending: 'Processando...',
      checkout_days: 'dias \u00fateis',
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
      radio_aviso: 'Listen to our full playlists! Open Spotify, save to your library and take the Labareda soundtrack wherever you go.',
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
      cart_title: 'Cart',
      cart_empty: 'Your cart is empty.',
      cart_subtotal: 'Subtotal',
      cart_checkout: 'Checkout',
      cart_continue: 'Continue Shopping',
      cart_remove: 'Remove',
      product_qty: 'Quantity',
      product_add_cart: 'Add to Cart',
      product_added: 'Product added to cart!',
      product_out_of_stock: 'Out of stock',
      product_in_stock: 'In stock',
      product_low_stock: 'Few units left',
      checkout_step1_title: 'Personal Info',
      checkout_step2_title: 'Shipping Address',
      checkout_step3_title: 'Order Summary',
      checkout_name: 'Full name',
      checkout_email: 'Email',
      checkout_phone: 'Phone',
      checkout_optional: '(optional)',
      checkout_street: 'Street',
      checkout_number: 'Number',
      checkout_complement: 'Complement',
      checkout_neighborhood: 'Neighborhood',
      checkout_city: 'City',
      checkout_state: 'State',
      checkout_shipping: 'Shipping',
      checkout_select_state: 'Select state to calculate shipping.',
      checkout_next: 'Continue',
      checkout_back: 'Back',
      checkout_confirm: 'Confirm Order',
      checkout_success_title: 'Order Confirmed!',
      checkout_success_msg: 'You will receive an email with the order details. Payment will be processed soon.',
      checkout_success_close: 'Close',
      checkout_subtotal: 'Subtotal',
      checkout_shipping_label: 'Shipping',
      checkout_total: 'Total',
      checkout_order_number: 'Order #',
      checkout_fill_fields: 'Please fill all required fields.',
      checkout_select_shipping: 'Please select a shipping option.',
      checkout_error: 'Error processing order. Please try again.',
      checkout_sending: 'Processing...',
      checkout_days: 'business days',
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

  /* Troca imagem quebrada de produto por um placeholder colorido (evita ícone de imagem quebrada) */
  window.__prodImgError = function (img) {
    var hue = img.getAttribute('data-hue') || '15';
    var ph = document.createElement('div');
    ph.className = 'product-image-placeholder';
    ph.style.setProperty('--product-hue', hue);
    if (img.parentNode) img.parentNode.replaceChild(ph, img);
  };

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
      var firstImage = (p.imagens && p.imagens.length > 0) ? p.imagens[0] : p.imagem_url;
      if (firstImage) {
        /* onerror: se a URL da imagem estiver quebrada, troca por um placeholder colorido */
        imageHTML = '<img src="' + firstImage + '" alt="' + productName + '" class="product-img" loading="lazy"'
          + ' data-hue="' + hue + '" onerror="window.__prodImgError && window.__prodImgError(this)">';
      } else {
        imageHTML = '<div class="product-image-placeholder" style="--product-hue: ' + hue + ';"></div>';
      }

      var promoPrice = '';
      if (p.preco_promocional && parseFloat(p.preco_promocional) > 0 && parseFloat(p.preco_promocional) < parseFloat(p.preco)) {
        promoPrice = 'R$ ' + parseFloat(p.preco_promocional).toFixed(2).replace('.', ',');
      }

      var priceDisplay = promoPrice
        ? '<span class="product-price-promo">' + promoPrice + '</span> <span class="product-price-original">' + price + '</span>'
        : price;

      gridHTML += '<article class="product-card product-card--clickable reveal' + delayClass + '" data-category="' + catSlug + '" data-product-idx="' + idx + '" role="button" tabindex="0" aria-label="' + productName + '">'
        + '<div class="product-image">'
        + imageHTML
        + (p.destaque ? '<span class="product-badge">' + badgeLabel + '</span>' : '')
        + '</div>'
        + '<div class="product-info">'
        + '<span class="product-category">' + catName + '</span>'
        + '<h3 class="product-name">' + productName + '</h3>'
        + (price ? '<p class="product-price">' + priceDisplay + '</p>' : '')
        + '<span class="product-link">' + viewLabel + '</span>'
        + '</div>'
        + '</article>';
    });

    shopGrid.innerHTML = gridHTML;

    /* Add click handlers to product cards */
    shopGrid.querySelectorAll('.product-card--clickable').forEach(function (card) {
      function openProduct() {
        var idx = parseInt(card.dataset.productIdx, 10);
        if (!isNaN(idx)) openProductModal(loadedProducts[idx]);
      }
      card.addEventListener('click', openProduct);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openProduct();
        }
      });
    });

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
    var hues = [28, 15, 200, 130];

    posts.forEach(function (post, idx) {
      var title = currentLang === 'pt' ? (post.titulo_pt || post.titulo) : (post.titulo_en || post.titulo_pt || post.titulo);
      var excerpt = currentLang === 'pt' ? (post.resumo_pt || post.resumo) : (post.resumo_en || post.resumo_pt || post.resumo);
      var delayClass = delays[idx % 4];
      var slug = post.slug || post.id;
      var destino = 'journal.html?slug=' + encodeURIComponent(slug);

      var imageHTML;
      if (post.imagem_capa) {
        imageHTML = '<img src="' + post.imagem_capa + '" alt="' + title + '" class="j-img" loading="lazy"'
          + ' data-hue="' + hues[idx % hues.length] + '" onerror="window.__journalImgError && window.__journalImgError(this)">';
      } else {
        imageHTML = '<div class="j-ph" style="--j-hue: ' + hues[idx % hues.length] + ';"></div>';
      }

      gridHTML += '<article class="j-card reveal' + delayClass + '" onclick="location.href=\'' + destino + '\'">'
        + '<div class="j-frame"><div class="j-frame-inner">' + imageHTML + '</div></div>'
        + '<h3 class="j-title">' + title + '</h3>'
        + (excerpt ? '<p class="j-desc">' + excerpt + '</p>' : '')
        + '<button class="j-plus" aria-label="Abrir journal" onclick="event.stopPropagation();location.href=\'' + destino + '\'">+</button>'
        + '</article>';
    });

    journalGrid.innerHTML = gridHTML;
    refreshScrollReveal();
  }

  /* imagem de capa quebrada -> placeholder colorido */
  window.__journalImgError = function (img) {
    var hue = img.getAttribute('data-hue') || '28';
    var ph = document.createElement('div');
    ph.className = 'j-ph';
    ph.style.setProperty('--j-hue', hue);
    if (img.parentNode) img.parentNode.replaceChild(ph, img);
  };

  function loadJournal() {
    /* Só os posts favoritados (destaque=true) vão para o site */
    supabaseFetch('journal_posts', '?publicado=eq.true&destaque=eq.true&select=*&order=published_at.desc')
      .then(function (data) {
        loadedJournalPosts = data || [];
        if (loadedJournalPosts.length > 0) {
          renderJournal(loadedJournalPosts);
        } else {
          /* nenhum post favoritado -> esconde a seção inteira */
          var grid = document.querySelector('.journal-grid');
          if (grid) grid.innerHTML = '';
          var sec = document.getElementById('journal');
          if (sec) sec.style.display = 'none';
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

      /* Build embed URL */
      var embedSrc = '';
      var spotifyOpenUrl = '';
      if (pl.spotify_embed_url || pl.spotify_url) {
        embedSrc = pl.spotify_embed_url || pl.spotify_url;
        /* Get the open.spotify URL for the "Ouvir" button */
        spotifyOpenUrl = embedSrc.replace('/embed/', '/');
        /* Ensure embed format */
        if (embedSrc.indexOf('/embed/') === -1 && embedSrc.indexOf('open.spotify.com') !== -1) {
          embedSrc = embedSrc.replace('open.spotify.com/', 'open.spotify.com/embed/');
        }
        if (embedSrc.indexOf('?') === -1) {
          embedSrc += '?utm_source=generator&theme=0';
        }
      }

      var embedHTML = embedSrc
        ? '<div class="radio-embed">'
          + '<iframe title="' + title + '" style="border-radius:12px" '
          + 'src="' + embedSrc + '" '
          + 'width="100%" height="352" frameBorder="0" '
          + 'allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" '
          + 'loading="lazy"></iframe>'
          + '</div>'
        : '';

      var openBtnPt = currentLang === 'pt' ? 'Ouvir playlist completa no Spotify' : 'Listen full playlist on Spotify';

      var openBtnHTML = spotifyOpenUrl
        ? '<a href="' + spotifyOpenUrl + '" target="_blank" rel="noopener noreferrer" class="radio-open-btn">'
          + '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>'
          + '<span>' + openBtnPt + '</span>'
          + '</a>'
        : '';

      gridHTML += '<div class="radio-card reveal' + delayClass + '">'
        + '<div class="radio-vinyl" aria-hidden="true">'
        + '<div class="vinyl-disc">'
        + '<div class="vinyl-label" style="--vinyl-color: ' + vinylColor + ';"><span>' + num + '</span></div>'
        + '</div>'
        + '</div>'
        + '<h3 class="radio-card-title">' + title + '</h3>'
        + '<p class="radio-card-desc">' + (desc || '') + '</p>'
        + openBtnHTML
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

        /* Apply about_video_url — embed video from Supabase Storage */
        if (siteConfig.about_video_url) {
          var videoContainer = document.getElementById('about-video-container');
          var fallbackImg = document.getElementById('about-fallback-img');
          if (videoContainer && fallbackImg) {
            var videoUrl = siteConfig.about_video_url;
            var isYouTube = videoUrl.indexOf('youtube.com') !== -1 || videoUrl.indexOf('youtu.be') !== -1;
            var isVimeo = videoUrl.indexOf('vimeo.com') !== -1;

            if (isYouTube || isVimeo) {
              /* External embed (YouTube/Vimeo) */
              var embedUrl = videoUrl;
              if (isYouTube) {
                var ytId = videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                if (ytId) embedUrl = 'https://www.youtube.com/embed/' + ytId[1] + '?rel=0&modestbranding=1';
              } else if (isVimeo) {
                var vimeoId = videoUrl.match(/vimeo\.com\/(\d+)/);
                if (vimeoId) embedUrl = 'https://player.vimeo.com/video/' + vimeoId[1];
              }
              var iframe = document.createElement('iframe');
              iframe.src = embedUrl;
              iframe.className = 'about-video__iframe';
              iframe.setAttribute('allowfullscreen', '');
              iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
              iframe.setAttribute('loading', 'lazy');
              iframe.title = 'Video institucional Sitio Labareda';
              fallbackImg.style.display = 'none';
              videoContainer.insertBefore(iframe, fallbackImg);
            } else {
              /* Direct video file (Supabase Storage / S3) */
              var video = document.createElement('video');
              video.className = 'about-video__player';
              video.controls = true;
              video.playsInline = true;
              video.preload = 'metadata';
              video.poster = fallbackImg.src;
              var source = document.createElement('source');
              source.src = videoUrl;
              source.type = videoUrl.indexOf('.webm') !== -1 ? 'video/webm' : 'video/mp4';
              video.appendChild(source);
              fallbackImg.style.display = 'none';
              videoContainer.insertBefore(video, fallbackImg);
            }
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
     14. CART SYSTEM
     ========================================================================== */
  var CART_KEY = 'labareda-cart';
  var SESSION_KEY = 'labareda-session-id';

  function getSessionId() {
    var sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  }

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartBadge();
  }

  function updateCartBadge() {
    var cart = getCart();
    var badge = document.getElementById('cart-badge');
    var totalItems = cart.reduce(function (sum, item) { return sum + item.quantidade; }, 0);
    if (badge) {
      badge.textContent = totalItems;
      badge.style.display = totalItems > 0 ? 'flex' : 'none';
    }
  }

  function addToCart(product, qty) {
    var cart = getCart();
    var existing = null;
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].produto_id === product.id) {
        existing = cart[i];
        break;
      }
    }

    var imgUrl = '';
    if (product.imagens && product.imagens.length > 0) {
      imgUrl = product.imagens[0];
    } else if (product.imagem_url) {
      imgUrl = product.imagem_url;
    }

    var nome = currentLang === 'pt' ? (product.nome_pt || product.nome) : (product.nome_en || product.nome_pt || product.nome);
    var preco = product.preco_promocional && parseFloat(product.preco_promocional) > 0 && parseFloat(product.preco_promocional) < parseFloat(product.preco)
      ? parseFloat(product.preco_promocional)
      : parseFloat(product.preco);

    if (existing) {
      existing.quantidade = Math.min(existing.quantidade + qty, product.estoque || 99);
      existing.nome = nome;
    } else {
      cart.push({
        produto_id: product.id,
        nome: nome,
        preco: preco,
        quantidade: qty,
        imagem_url: imgUrl,
      });
    }

    saveCart(cart);
    showToast(translations[currentLang].product_added, false);
  }

  function removeFromCart(produtoId) {
    var cart = getCart().filter(function (item) { return item.produto_id !== produtoId; });
    saveCart(cart);
    renderCartDrawer();
  }

  function updateCartItemQty(produtoId, delta) {
    var cart = getCart();
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].produto_id === produtoId) {
        cart[i].quantidade = Math.max(1, Math.min(cart[i].quantidade + delta, 99));
        break;
      }
    }
    saveCart(cart);
    renderCartDrawer();
  }

  function formatPrice(value) {
    return 'R$ ' + parseFloat(value).toFixed(2).replace('.', ',');
  }

  /* ---------- Cart Drawer ---------- */
  function openCartDrawer() {
    renderCartDrawer();
    document.getElementById('cart-overlay').classList.add('aberto');
    document.body.style.overflow = 'hidden';
  }

  function closeCartDrawer() {
    document.getElementById('cart-overlay').classList.remove('aberto');
    document.body.style.overflow = '';
  }

  function renderCartDrawer() {
    var cart = getCart();
    var emptyEl = document.getElementById('cart-empty');
    var itemsEl = document.getElementById('cart-items');
    var footerEl = document.getElementById('cart-drawer-footer');
    var subtotalEl = document.getElementById('cart-subtotal-value');

    if (cart.length === 0) {
      emptyEl.style.display = 'block';
      emptyEl.textContent = translations[currentLang].cart_empty;
      itemsEl.innerHTML = '';
      footerEl.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    footerEl.style.display = 'flex';

    var removeLabel = translations[currentLang].cart_remove;
    var html = '';
    var subtotal = 0;

    cart.forEach(function (item) {
      subtotal += item.preco * item.quantidade;
      var imgHTML = item.imagem_url
        ? '<img src="' + item.imagem_url + '" alt="' + item.nome + '" loading="lazy">'
        : '<div class="cart-item__image-placeholder"></div>';

      html += '<div class="cart-item" data-cart-id="' + item.produto_id + '">'
        + '<div class="cart-item__image">' + imgHTML + '</div>'
        + '<div class="cart-item__details">'
        + '<span class="cart-item__name">' + item.nome + '</span>'
        + '<span class="cart-item__price">' + formatPrice(item.preco) + '</span>'
        + '<div class="cart-item__controls">'
        + '<button class="cart-item__qty-btn" data-action="minus" data-id="' + item.produto_id + '" type="button" aria-label="Diminuir">-</button>'
        + '<span class="cart-item__qty">' + item.quantidade + '</span>'
        + '<button class="cart-item__qty-btn" data-action="plus" data-id="' + item.produto_id + '" type="button" aria-label="Aumentar">+</button>'
        + '<button class="cart-item__remove" data-action="remove" data-id="' + item.produto_id + '" type="button">' + removeLabel + '</button>'
        + '</div>'
        + '</div>'
        + '</div>';
    });

    itemsEl.innerHTML = html;
    subtotalEl.textContent = formatPrice(subtotal);

    /* Bind cart item actions */
    itemsEl.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = this.dataset.action;
        var id = this.dataset.id;
        if (action === 'minus') updateCartItemQty(id, -1);
        else if (action === 'plus') updateCartItemQty(id, 1);
        else if (action === 'remove') removeFromCart(id);
      });
    });
  }

  /* Cart drawer event bindings */
  document.getElementById('cart-toggle').addEventListener('click', openCartDrawer);

  document.getElementById('cart-drawer-close').addEventListener('click', closeCartDrawer);

  document.getElementById('cart-continue-btn').addEventListener('click', closeCartDrawer);

  document.getElementById('cart-overlay').addEventListener('click', function (e) {
    if (e.target === this) closeCartDrawer();
  });

  document.getElementById('cart-checkout-btn').addEventListener('click', function () {
    closeCartDrawer();
    openCheckout();
  });

  /* ==========================================================================
     15. PRODUCT DETAIL MODAL
     ========================================================================== */
  var currentProductForModal = null;

  function openProductModal(product) {
    if (!product) return;
    currentProductForModal = product;

    var modal = document.getElementById('product-modal');
    var galleryEl = document.getElementById('product-modal-gallery');
    var categoryEl = document.getElementById('product-modal-category');
    var nameEl = document.getElementById('product-modal-name');
    var descEl = document.getElementById('product-modal-description');
    var pricingEl = document.getElementById('product-modal-pricing');
    var stockEl = document.getElementById('product-modal-stock');
    var qtyInput = document.getElementById('product-modal-qty-input');
    var addBtn = document.getElementById('product-modal-add');

    var nome = currentLang === 'pt' ? (product.nome_pt || product.nome) : (product.nome_en || product.nome_pt || product.nome);
    var desc = currentLang === 'pt' ? (product.descricao_pt || '') : (product.descricao_en || product.descricao_pt || '');
    var catName = product.categorias
      ? (currentLang === 'pt' ? product.categorias.nome_pt : product.categorias.nome_en)
      : '';

    nameEl.textContent = nome;
    categoryEl.textContent = catName;
    descEl.textContent = desc;

    /* Images */
    var images = [];
    if (product.imagens && product.imagens.length > 0) {
      images = product.imagens;
    } else if (product.imagem_url) {
      images = [product.imagem_url];
    }

    if (images.length > 0) {
      var mainImg = '<img src="' + images[0] + '" alt="' + nome + '" id="product-modal-main-img">';
      var thumbsHTML = '';
      if (images.length > 1) {
        thumbsHTML = '<div class="product-modal__gallery-thumbs">';
        images.forEach(function (img, i) {
          thumbsHTML += '<div class="product-modal__thumb' + (i === 0 ? ' active' : '') + '" data-img-idx="' + i + '">'
            + '<img src="' + img + '" alt="' + nome + ' ' + (i + 1) + '">'
            + '</div>';
        });
        thumbsHTML += '</div>';
      }
      galleryEl.innerHTML = mainImg + thumbsHTML;

      /* Thumb click handlers */
      galleryEl.querySelectorAll('.product-modal__thumb').forEach(function (thumb) {
        thumb.addEventListener('click', function () {
          var idx = parseInt(this.dataset.imgIdx, 10);
          document.getElementById('product-modal-main-img').src = images[idx];
          galleryEl.querySelectorAll('.product-modal__thumb').forEach(function (t) { t.classList.remove('active'); });
          this.classList.add('active');
        });
      });
    } else {
      galleryEl.innerHTML = '<div class="product-modal__gallery-placeholder"></div>';
    }

    /* Pricing */
    var preco = product.preco ? parseFloat(product.preco) : 0;
    var promoPreco = product.preco_promocional ? parseFloat(product.preco_promocional) : 0;
    var hasPromo = promoPreco > 0 && promoPreco < preco;

    if (hasPromo) {
      pricingEl.innerHTML = '<span class="product-modal__price-promo">' + formatPrice(promoPreco) + '</span>'
        + '<span class="product-modal__price-original">' + formatPrice(preco) + '</span>';
    } else {
      pricingEl.innerHTML = '<span class="product-modal__price">' + formatPrice(preco) + '</span>';
    }

    /* Stock */
    var estoque = product.estoque != null ? product.estoque : 99;
    if (estoque <= 0) {
      stockEl.textContent = translations[currentLang].product_out_of_stock;
      stockEl.className = 'product-modal__stock product-modal__stock--out';
      addBtn.disabled = true;
      addBtn.style.opacity = '0.5';
    } else if (estoque <= (product.estoque_minimo || 5)) {
      stockEl.textContent = translations[currentLang].product_low_stock + ' (' + estoque + ')';
      stockEl.className = 'product-modal__stock product-modal__stock--low';
      addBtn.disabled = false;
      addBtn.style.opacity = '';
    } else {
      stockEl.textContent = translations[currentLang].product_in_stock;
      stockEl.className = 'product-modal__stock';
      addBtn.disabled = false;
      addBtn.style.opacity = '';
    }

    /* Quantity */
    var maxQty = Math.min(estoque, 10);
    qtyInput.value = 1;
    qtyInput.max = maxQty;

    modal.classList.add('aberto');
    document.body.style.overflow = 'hidden';
  }

  function closeProductModal() {
    document.getElementById('product-modal').classList.remove('aberto');
    document.body.style.overflow = '';
    currentProductForModal = null;
  }

  /* Product modal event bindings */
  document.getElementById('product-modal-close').addEventListener('click', closeProductModal);

  document.getElementById('product-modal').addEventListener('click', function (e) {
    if (e.target === this) closeProductModal();
  });

  document.getElementById('qty-minus').addEventListener('click', function () {
    var input = document.getElementById('product-modal-qty-input');
    var val = parseInt(input.value, 10);
    if (val > 1) input.value = val - 1;
  });

  document.getElementById('qty-plus').addEventListener('click', function () {
    var input = document.getElementById('product-modal-qty-input');
    var val = parseInt(input.value, 10);
    var max = parseInt(input.max, 10) || 10;
    if (val < max) input.value = val + 1;
  });

  document.getElementById('product-modal-add').addEventListener('click', function () {
    if (!currentProductForModal) return;
    var qty = parseInt(document.getElementById('product-modal-qty-input').value, 10) || 1;
    addToCart(currentProductForModal, qty);
    closeProductModal();
  });

  /* ==========================================================================
     16. CHECKOUT SYSTEM
     ========================================================================== */
  var checkoutStep = 1;
  var selectedFrete = null;
  var freteTabela = [];

  function openCheckout() {
    var cart = getCart();
    if (cart.length === 0) return;

    checkoutStep = 1;
    selectedFrete = null;
    showCheckoutStep(1);

    /* Load frete tabela */
    if (freteTabela.length === 0) {
      supabaseFetch('frete_tabela', '?select=*')
        .then(function (data) {
          if (data) freteTabela = data;
        })
        .catch(function () { /* noop */ });
    }

    document.getElementById('checkout-modal').classList.add('aberto');
    document.body.style.overflow = 'hidden';
  }

  function closeCheckout() {
    document.getElementById('checkout-modal').classList.remove('aberto');
    document.body.style.overflow = '';
  }

  function showCheckoutStep(step) {
    checkoutStep = step;
    for (var i = 1; i <= 3; i++) {
      var el = document.getElementById('checkout-step-' + i);
      if (el) el.style.display = i === step ? 'block' : 'none';
    }
    document.getElementById('checkout-success').style.display = 'none';
    document.getElementById('checkout-steps').style.display = '';

    /* Update step indicators */
    document.querySelectorAll('.checkout-step-dot').forEach(function (dot) {
      var s = parseInt(dot.dataset.step, 10);
      dot.classList.remove('active', 'done');
      if (s === step) dot.classList.add('active');
      else if (s < step) dot.classList.add('done');
    });
  }

  function getFreteRegion(estado) {
    if (estado === 'BA') return 'BA';
    var ne = ['MA', 'PI', 'CE', 'RN', 'PB', 'PE', 'AL', 'SE'];
    if (ne.indexOf(estado) !== -1) return 'NE';
    var seSul = ['SP', 'RJ', 'MG', 'ES', 'PR', 'SC', 'RS'];
    if (seSul.indexOf(estado) !== -1) return 'SE_SUL';
    return 'OUTROS';
  }

  function renderFreteOptions(estado) {
    var container = document.getElementById('checkout-frete-options');
    if (!estado || freteTabela.length === 0) {
      container.innerHTML = '<p class="checkout-frete-hint">' + translations[currentLang].checkout_select_state + '</p>';
      selectedFrete = null;
      return;
    }

    var region = getFreteRegion(estado);
    var html = '';
    var daysLabel = translations[currentLang].checkout_days;

    freteTabela.forEach(function (ft) {
      var regionName = ft.regiao || ft.nome || '';
      var isMatch = regionName.toUpperCase() === region;
      var selected = isMatch ? ' selected' : '';

      html += '<label class="frete-option' + selected + '">'
        + '<input type="radio" name="frete" value="' + (ft.id || ft.regiao) + '" ' + (isMatch ? 'checked' : '') + '>'
        + '<div class="frete-option__info">'
        + '<span class="frete-option__region">' + regionName + '</span>'
        + '<span class="frete-option__prazo">' + (ft.prazo_dias || ft.prazo || '') + ' ' + daysLabel + '</span>'
        + '</div>'
        + '<span class="frete-option__price">' + formatPrice(ft.valor || ft.preco || 0) + '</span>'
        + '</label>';

      if (isMatch) {
        selectedFrete = {
          regiao: regionName,
          valor: parseFloat(ft.valor || ft.preco || 0),
          prazo: ft.prazo_dias || ft.prazo || '',
        };
      }
    });

    container.innerHTML = html;

    /* Bind frete radio change */
    container.querySelectorAll('input[name="frete"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        var freteId = this.value;
        container.querySelectorAll('.frete-option').forEach(function (opt) { opt.classList.remove('selected'); });
        this.closest('.frete-option').classList.add('selected');

        for (var i = 0; i < freteTabela.length; i++) {
          var ft = freteTabela[i];
          if ((ft.id || ft.regiao) === freteId) {
            selectedFrete = {
              regiao: ft.regiao || ft.nome || '',
              valor: parseFloat(ft.valor || ft.preco || 0),
              prazo: ft.prazo_dias || ft.prazo || '',
            };
            break;
          }
        }
      });
    });
  }

  function renderCheckoutSummary() {
    var cart = getCart();
    var summaryEl = document.getElementById('checkout-summary');
    var totalsEl = document.getElementById('checkout-totals');

    var subtotal = 0;
    var html = '';
    cart.forEach(function (item) {
      var lineTotal = item.preco * item.quantidade;
      subtotal += lineTotal;
      html += '<div class="checkout-summary-item">'
        + '<span class="checkout-summary-item__name">' + item.nome + '</span>'
        + '<span class="checkout-summary-item__qty">x' + item.quantidade + '</span>'
        + '<span class="checkout-summary-item__price">' + formatPrice(lineTotal) + '</span>'
        + '</div>';
    });
    summaryEl.innerHTML = html;

    var freteVal = selectedFrete ? selectedFrete.valor : 0;
    var total = subtotal + freteVal;

    var t = translations[currentLang];
    totalsEl.innerHTML = '<div class="checkout-total-line">'
      + '<span>' + t.checkout_subtotal + '</span>'
      + '<span>' + formatPrice(subtotal) + '</span>'
      + '</div>'
      + '<div class="checkout-total-line">'
      + '<span>' + t.checkout_shipping_label + (selectedFrete ? ' (' + selectedFrete.regiao + ')' : '') + '</span>'
      + '<span>' + formatPrice(freteVal) + '</span>'
      + '</div>'
      + '<div class="checkout-total-line checkout-total-line--grand">'
      + '<span>' + t.checkout_total + '</span>'
      + '<span>' + formatPrice(total) + '</span>'
      + '</div>';
  }

  /* Checkout event bindings */
  document.getElementById('checkout-close').addEventListener('click', closeCheckout);

  document.getElementById('checkout-modal').addEventListener('click', function (e) {
    if (e.target === this) closeCheckout();
  });

  /* Step 1 -> Step 2 */
  document.getElementById('checkout-next-1').addEventListener('click', function () {
    var nome = document.getElementById('checkout-nome').value.trim();
    var email = document.getElementById('checkout-email').value.trim();
    var telefone = document.getElementById('checkout-telefone').value.trim();

    if (!nome || !email || !telefone) {
      showToast(translations[currentLang].checkout_fill_fields, true);
      return;
    }

    showCheckoutStep(2);
  });

  /* Step 2 -> Step 3 */
  document.getElementById('checkout-next-2').addEventListener('click', function () {
    var rua = document.getElementById('checkout-rua').value.trim();
    var numero = document.getElementById('checkout-numero').value.trim();
    var bairro = document.getElementById('checkout-bairro').value.trim();
    var cidade = document.getElementById('checkout-cidade').value.trim();
    var estado = document.getElementById('checkout-estado').value;

    if (!rua || !numero || !bairro || !cidade || !estado) {
      showToast(translations[currentLang].checkout_fill_fields, true);
      return;
    }

    if (!selectedFrete) {
      showToast(translations[currentLang].checkout_select_shipping, true);
      return;
    }

    renderCheckoutSummary();
    showCheckoutStep(3);
  });

  /* Back buttons */
  document.getElementById('checkout-back-2').addEventListener('click', function () {
    showCheckoutStep(1);
  });

  document.getElementById('checkout-back-3').addEventListener('click', function () {
    showCheckoutStep(2);
  });

  /* Auto-calculate frete on estado change */
  document.getElementById('checkout-estado').addEventListener('change', function () {
    renderFreteOptions(this.value);
  });

  /* CEP automatico: ao digitar o CEP, puxa endereco/bairro/cidade/estado e ja
     seleciona o frete (ViaCEP). Usuario so preenche numero/complemento.
     Todos os campos continuam editaveis. */
  (function () {
    var cepEl = document.getElementById('checkout-cep');
    if (!cepEl) return;
    function buscarCep() {
      var cep = (cepEl.value || '').replace(/\D/g, '');
      if (cep.length !== 8) return;
      cepEl.disabled = true;
      fetch('https://viacep.com.br/ws/' + cep + '/json/')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && !d.erro) {
            if (d.logradouro) document.getElementById('checkout-rua').value = d.logradouro;
            if (d.bairro) document.getElementById('checkout-bairro').value = d.bairro;
            if (d.localidade) document.getElementById('checkout-cidade').value = d.localidade;
            var estadoEl = document.getElementById('checkout-estado');
            if (d.uf && estadoEl) {
              estadoEl.value = d.uf;
              renderFreteOptions(d.uf); /* seleciona o frete da regiao automaticamente */
            }
            var numEl = document.getElementById('checkout-numero');
            if (numEl) numEl.focus(); /* leva o cursor direto pro numero */
          }
        })
        .catch(function () {})
        .finally(function () { cepEl.disabled = false; });
    }
    cepEl.addEventListener('blur', buscarCep);
    cepEl.addEventListener('input', function () {
      if ((cepEl.value || '').replace(/\D/g, '').length === 8) buscarCep();
    });
  })();

  /* Confirm Order */
  document.getElementById('checkout-confirm').addEventListener('click', function () {
    var btn = this;
    var origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = translations[currentLang].checkout_sending;

    var cart = getCart();
    if (cart.length === 0) return;

    var nome = document.getElementById('checkout-nome').value.trim();
    var email = document.getElementById('checkout-email').value.trim();
    var telefone = document.getElementById('checkout-telefone').value.trim();
    var cpf = document.getElementById('checkout-cpf').value.trim() || null;

    var endereco = {
      rua: document.getElementById('checkout-rua').value.trim(),
      numero: document.getElementById('checkout-numero').value.trim(),
      complemento: document.getElementById('checkout-complemento').value.trim(),
      bairro: document.getElementById('checkout-bairro').value.trim(),
      cidade: document.getElementById('checkout-cidade').value.trim(),
      estado: document.getElementById('checkout-estado').value,
      cep: document.getElementById('checkout-cep').value.trim(),
    };

    /* A loja NAO grava mais direto no banco. Manda o carrinho + dados do
       cliente para a funcao SEGURA no servidor, que cria o pedido (com a
       chave secreta, validando precos) e devolve o link do Mercado Pago. */
    var itensCarrinho = cart.map(function (item) {
      return { produto_id: item.produto_id, quantidade: item.quantidade };
    });

    fetch('/.netlify/functions/criar-pagamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente: { nome: nome, email: email, telefone: telefone, cpf: cpf, endereco: endereco },
        itens: itensCarrinho,
        frete: selectedFrete ? { regiao: selectedFrete.regiao, valor: selectedFrete.valor } : { valor: 0 },
      }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok || !data.ok) {
            throw new Error((data && data.erro) || 'Falha ao iniciar o pagamento');
          }
          var link = data.init_point || data.sandbox_init_point;
          if (!link) throw new Error('Link de pagamento nao recebido');
          saveCart([]);
          updateCartBadge();
          window.location.href = link;
        });
      })
      .catch(function (err) {
        console.error('Checkout error:', err);
        showToast(translations[currentLang].checkout_error, true);
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = origText;
      });
  });

  /* Success close */
  document.getElementById('checkout-success-close').addEventListener('click', closeCheckout);

  /* Retorno do Mercado Pago (back_urls): mostra feedback ao cliente */
  (function () {
    var params = new URLSearchParams(window.location.search);
    var pg = params.get('pagamento');
    if (!pg) return;
    var num = params.get('pedido');
    var t = translations[currentLang] || {};
    if (pg === 'sucesso') {
      showToast((t.checkout_paid_ok || 'Pagamento aprovado! Pedido') + (num ? ' #' + num : ''));
    } else if (pg === 'pendente') {
      showToast(t.checkout_paid_pending || 'Pagamento pendente. Voce recebera a confirmacao em breve.');
    } else if (pg === 'falhou') {
      showToast(t.checkout_paid_fail || 'Pagamento nao concluido. Tente novamente.', true);
    }
    /* Limpa os parametros da URL para nao repetir o aviso ao recarregar */
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname + '#shop');
    }
  })();

  /* Escape key for all modals */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var productModal = document.getElementById('product-modal');
      if (productModal && productModal.classList.contains('aberto')) {
        closeProductModal();
        return;
      }
      var cartOverlay = document.getElementById('cart-overlay');
      if (cartOverlay && cartOverlay.classList.contains('aberto')) {
        closeCartDrawer();
        return;
      }
      var checkoutModal = document.getElementById('checkout-modal');
      if (checkoutModal && checkoutModal.classList.contains('aberto')) {
        closeCheckout();
        return;
      }
    }
  });

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

    /* Cart badge init */
    getSessionId();
    updateCartBadge();

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
     BOOKING MODAL — reserva de estada
     ========================================================================== */
  window.abrirBookingModal = function() {
    var modal = document.getElementById('booking-modal');
    modal.classList.add('aberto');
    document.body.style.overflow = 'hidden';
    var today = new Date().toISOString().split('T')[0];
    document.getElementById('booking-checkin').min = today;
    document.getElementById('booking-checkout').min = today;
  };

  function fecharBookingModal() {
    var modal = document.getElementById('booking-modal');
    modal.classList.remove('aberto');
    document.body.style.overflow = '';
  }

  /* Close booking modal on overlay click or close button */
  document.addEventListener('click', function(e) {
    if (e.target.id === 'booking-close' || e.target.id === 'booking-modal') {
      fecharBookingModal();
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var modal = document.getElementById('booking-modal');
      if (modal && modal.classList.contains('aberto')) {
        fecharBookingModal();
      }
    }
  });

  /* Booking form submit */
  var bookingForm = document.getElementById('booking-form');
  if (bookingForm) {
    bookingForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = document.querySelector('.booking-submit');
      btn.textContent = currentLang === 'pt' ? 'Enviando...' : 'Sending...';
      btn.disabled = true;

      var data = {
        nome: document.getElementById('booking-nome').value,
        email: document.getElementById('booking-email').value,
        telefone: document.getElementById('booking-telefone').value || null,
        checkin: document.getElementById('booking-checkin').value,
        checkout: document.getElementById('booking-checkout').value,
        hospedes: parseInt(document.getElementById('booking-hospedes').value),
        mensagem: document.getElementById('booking-mensagem').value || null,
      };

      supabaseInsert('reservas', data)
        .then(function(ok) {
          if (ok) {
            fecharBookingModal();
            bookingForm.reset();
            showToast(
              currentLang === 'pt'
                ? 'Solicitacao enviada! Entraremos em contato em breve.'
                : 'Request sent! We will contact you soon.',
              false
            );
          } else {
            showToast(
              currentLang === 'pt'
                ? 'Erro ao enviar. Tente novamente.'
                : 'Error sending. Please try again.',
              true
            );
          }
        })
        .catch(function() {
          showToast(
            currentLang === 'pt'
              ? 'Erro ao enviar. Tente novamente.'
              : 'Error sending. Please try again.',
            true
          );
        })
        .finally(function() {
          btn.textContent = currentLang === 'pt' ? 'Solicitar Reserva' : 'Request Booking';
          btn.disabled = false;
        });
    });
  }

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
