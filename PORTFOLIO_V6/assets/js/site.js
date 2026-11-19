/* ==========================================================
   Ardit Hasangjekaj · portfolio
   No dependencies. Five small parts:
     1. Page timeline (bottom bar): clips sized to sections,
        playhead follows scroll, ruler can be dragged to scrub
     2. Video player: every thumbnail plays on the page, with
        previous / next and a shareable link per video
     3. Facebook players: loaded only when scrolled into view,
        and kept legible on narrow cards
     4. Preview monitor in the intro: cuts through the client reels
     5. Contact form (sends through Formspree without leaving the page)
   The page works without this file: every video is still a link.
   ========================================================== */

(function () {
	'use strict';

	var doc = document.documentElement;
	var slice = Array.prototype.slice;
	var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	var year = document.getElementById('year');
	if (year) year.textContent = new Date().getFullYear();

	/* ---------- 1. Page timeline ---------- */

	(function timeline() {
		var track = document.getElementById('tl-track');
		var ruler = document.getElementById('tl-ruler');
		var playhead = document.getElementById('tl-playhead');
		var label = document.getElementById('tl-label');
		var pct = document.getElementById('tl-pct');
		if (!track || !playhead) return;

		var clips = slice.call(track.querySelectorAll('.clip'));
		var sections = clips.map(function (clip) { return document.getElementById(clip.dataset.target); });
		var navLinks = slice.call(document.querySelectorAll('.topnav a[href^="#"]'));

		var tops = [], ends = [], docH = 0, maxScroll = 0, viewH = 0;
		var active = -1, queued = false, dragging = false;

		// Where on the page the playhead is "reading". Near the top of the page
		// that is the top of the window; it slides down to the bottom of the
		// window as the page ends, so the playhead can reach the last clip.
		function readingPoint(scrollY) {
			if (maxScroll <= 0) return 0;
			var p = Math.min(Math.max(scrollY / maxScroll, 0), 1);
			return scrollY + viewH * Math.pow(p, 5);
		}

		function scrollForReadingPoint(y) {
			var lo = 0, hi = maxScroll;
			for (var i = 0; i < 24; i++) {
				var mid = (lo + hi) / 2;
				if (readingPoint(mid) < y) lo = mid; else hi = mid;
			}
			return (lo + hi) / 2;
		}

		function measure() {
			viewH = window.innerHeight;
			docH = doc.scrollHeight;
			maxScroll = Math.max(docH - viewH, 0);
			tops = sections.map(function (s, i) {
				return i === 0 ? 0 : s.getBoundingClientRect().top + window.scrollY;
			});
			ends = tops.map(function (t, i) { return i < tops.length - 1 ? tops[i + 1] : docH; });
			clips.forEach(function (clip, i) {
				clip.style.setProperty('--grow', Math.max(Math.round(ends[i] - tops[i]), 1));
			});
			update();
		}

		function update() {
			queued = false;
			var scrollY = window.scrollY;
			var y = readingPoint(scrollY) + 2;
			var i = tops.length - 1;
			while (i > 0 && y < tops[i]) i--;

			var span = ends[i] - tops[i];
			var frac = span > 0 ? Math.min(Math.max((y - tops[i]) / span, 0), 1) : 0;
			var clip = clips[i];
			playhead.style.setProperty('--x', (clip.offsetLeft + frac * clip.offsetWidth).toFixed(1) + 'px');

			if (pct) pct.textContent = Math.round((maxScroll > 0 ? scrollY / maxScroll : 0) * 100) + '%';

			if (i !== active) {
				active = i;
				clips.forEach(function (c, n) {
					c.classList.toggle('is-active', n === i);
					if (n === i) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current');
				});
				if (label) label.textContent = sections[i].dataset.section || clip.textContent;
				navLinks.forEach(function (a) {
					if (a.getAttribute('href') === '#' + sections[i].id) a.setAttribute('aria-current', 'true');
					else a.removeAttribute('aria-current');
				});
			}
		}

		function requestUpdate() {
			if (!queued) { queued = true; requestAnimationFrame(update); }
		}

		// Dragging the ruler scrubs the page.
		function scrubTo(clientX) {
			var x = clientX - track.getBoundingClientRect().left;
			var i = 0;
			for (var n = 0; n < clips.length; n++) { if (x >= clips[n].offsetLeft) i = n; }
			var clip = clips[i];
			var frac = Math.min(Math.max((x - clip.offsetLeft) / clip.offsetWidth, 0), 1);
			var y = tops[i] + frac * (ends[i] - tops[i]);
			window.scrollTo({ top: scrollForReadingPoint(y), behavior: 'instant' });
		}

		if (ruler) {
			ruler.addEventListener('pointerdown', function (e) {
				dragging = true;
				ruler.setPointerCapture(e.pointerId);
				track.classList.add('is-scrubbing');
				scrubTo(e.clientX);
				e.preventDefault();
			});
			ruler.addEventListener('pointermove', function (e) { if (dragging) scrubTo(e.clientX); });
			['pointerup', 'pointercancel'].forEach(function (type) {
				ruler.addEventListener(type, function () {
					dragging = false;
					track.classList.remove('is-scrubbing');
				});
			});
		}

		window.addEventListener('scroll', requestUpdate, { passive: true });
		window.addEventListener('resize', measure);
		window.addEventListener('load', measure);
		if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);
		if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
		measure();
	})();

	/* ---------- 2. Video player ---------- */

	(function player() {
		var dialog = document.getElementById('player');
		var frame = document.getElementById('player-frame');
		var title = document.getElementById('player-title');
		var count = document.getElementById('player-count');
		var ext = document.getElementById('player-ext');
		var source = document.getElementById('player-source');
		var closeBtn = document.getElementById('player-close');
		var copyBtn = document.getElementById('player-copy');
		var prevBtn = document.getElementById('player-prev');
		var nextBtn = document.getElementById('player-next');
		if (!dialog || !frame || typeof dialog.showModal !== 'function') return;   // links open in a new tab instead

		// YouTube refuses to play inside a page opened straight from disk (file://).
		// There those videos keep opening on YouTube; on the live site they play here.
		var fromDisk = location.protocol === 'file:';
		function playable(link) {
			return !!link.dataset.embed && !(fromDisk && /youtube/.test(link.dataset.embed));
		}

		// The playlist: every video on the page once, in page order.
		var list = [];
		slice.call(document.querySelectorAll('main .section .js-play')).forEach(function (link) {
			if (!playable(link)) return;
			var known = list.some(function (item) { return item.embed === link.dataset.embed; });
			if (!known) {
				list.push({
					embed: link.dataset.embed,
					href: link.href,
					title: link.dataset.title || '',
					tall: link.dataset.ratio === 'tall',
					source: link.dataset.source || 'Google Drive',
					id: link.dataset.id || ''
				});
			}
		});

		var current = -1;

		function indexOfEmbed(embed) {
			for (var i = 0; i < list.length; i++) { if (list[i].embed === embed) return i; }
			return -1;
		}

		function setHash(item) {
			if (!history.replaceState) return;
			var url = location.pathname + location.search + (item && item.id ? '#watch-' + item.id : '');
			try { history.replaceState(null, '', url); } catch (err) { /* file:// in some browsers */ }
		}

		function show(index) {
			current = (index + list.length) % list.length;
			var item = list[current];

			var iframe = document.createElement('iframe');
			iframe.title = item.title || 'Video';
			iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
			iframe.referrerPolicy = 'strict-origin-when-cross-origin';
			frame.classList.add('is-loading');
			iframe.addEventListener('load', function () { frame.classList.remove('is-loading'); });
			iframe.src = item.embed;
			frame.textContent = '';
			frame.appendChild(iframe);

			title.textContent = item.title;
			if (count) count.textContent = (current + 1) + ' / ' + list.length;
			if (ext) ext.href = item.href;
			if (source) source.textContent = item.source;
			dialog.classList.toggle('player--tall', item.tall);
			if (copyBtn) {
				copyBtn.hidden = !(item.id && navigator.clipboard && navigator.clipboard.writeText);
				copyBtn.textContent = 'Copy link';
			}

			if (!dialog.open) {
				dialog.showModal();
				doc.classList.add('is-locked');
			}
			setHash(item);
		}

		document.addEventListener('click', function (e) {
			var link = e.target.closest ? e.target.closest('.js-play') : null;
			if (!link || !playable(link)) return;
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;   // let "open in new tab" through
			var index = indexOfEmbed(link.dataset.embed);
			if (index < 0) return;
			e.preventDefault();
			show(index);
		});

		if (list.length < 2) dialog.classList.add('player--single');
		if (prevBtn) prevBtn.addEventListener('click', function () { show(current - 1); });
		if (nextBtn) nextBtn.addEventListener('click', function () { show(current + 1); });

		dialog.addEventListener('keydown', function (e) {
			if (list.length < 2 || e.altKey || e.ctrlKey || e.metaKey) return;
			if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1); }
			if (e.key === 'ArrowRight') { e.preventDefault(); show(current + 1); }
		});

		if (closeBtn) closeBtn.addEventListener('click', function () { dialog.close(); });

		// Copies a link that opens the page straight on the current video.
		if (copyBtn) copyBtn.addEventListener('click', function () {
			var item = list[current];
			if (!item) return;
			var link = location.href.split('#')[0] + '#watch-' + item.id;
			navigator.clipboard.writeText(link).then(function () {
				copyBtn.textContent = 'Link copied';
			}, function () {
				copyBtn.textContent = 'Copy failed';
			});
		});

		// Click on the dark area around the video closes it.
		dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

		// Stop playback whenever the player closes (button, backdrop or Escape).
		dialog.addEventListener('close', function () {
			frame.textContent = '';
			frame.classList.remove('is-loading');
			doc.classList.remove('is-locked');
			setHash(null);
		});

		// A link such as yoursite.com/#watch-appletini opens straight on that video.
		var wanted = /^#watch-(.+)$/.exec(location.hash);
		if (wanted) {
			for (var i = 0; i < list.length; i++) {
				if (list[i].id === wanted[1]) { show(i); break; }
			}
		}
	})();

	/* ---------- 3. Facebook players ---------- */

	// Each player is created when its card comes near the screen, so the page
	// does not load ten Facebook players up front. Facebook's player also needs
	// about 220px of width: on smaller cards it is rendered at 220px and scaled
	// down so nothing is cropped.
	(function embeds() {
		var boxes = slice.call(document.querySelectorAll('.embed[data-src]'));
		if (!boxes.length) return;
		var MIN = 220;

		var sizer = 'ResizeObserver' in window ? new ResizeObserver(function (entries) {
			entries.forEach(function (entry) {
				var box = entry.target;
				var iframe = box.querySelector('iframe');
				var w = box.clientWidth, h = box.clientHeight;
				if (!iframe || !w) return;
				if (w < MIN) {
					iframe.style.width = MIN + 'px';
					iframe.style.height = (MIN * h / w).toFixed(1) + 'px';
					iframe.style.transform = 'scale(' + (w / MIN).toFixed(4) + ')';
				} else {
					iframe.style.width = iframe.style.height = iframe.style.transform = '';
				}
			});
		}) : null;

		function mount(box) {
			if (box.querySelector('iframe')) return;
			var iframe = document.createElement('iframe');
			iframe.title = box.dataset.title || 'Video on Facebook';
			iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
			box.classList.add('is-loading');
			iframe.addEventListener('load', function () {
				box.classList.remove('is-loading');
				box.classList.add('is-ready');
			});
			// If the player is blocked or very slow, stop the loading shimmer and
			// leave the "Watch on Facebook" link in view.
			setTimeout(function () { box.classList.remove('is-loading'); }, 8000);
			iframe.src = box.dataset.src;
			box.appendChild(iframe);
			if (sizer) sizer.observe(box);
		}

		if (!('IntersectionObserver' in window)) { boxes.forEach(mount); return; }

		var watcher = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				if (!entry.isIntersecting) return;
				watcher.unobserve(entry.target);
				mount(entry.target);
			});
		}, { rootMargin: '400px 0px' });
		boxes.forEach(function (box) { watcher.observe(box); });
	})();

	/* ---------- 4. Preview monitor ---------- */

	// Shows the client reels one after another with hard cuts, like a rough
	// assembly. Timing comes from the CSS animation on the progress segments:
	// when a segment finishes filling, the monitor cuts to the next clip.
	(function monitor() {
		var root = document.getElementById('monitor');
		var screen = document.getElementById('monitor-screen');
		var segs = document.getElementById('monitor-segs');
		var foot = document.getElementById('monitor-foot');
		var titleEls = slice.call(root.querySelectorAll('[data-monitor-title]'));
		var countEl = document.getElementById('monitor-count');
		var tcEl = document.getElementById('monitor-tc');
		var toggle = document.getElementById('monitor-toggle');
		var nextBtn = document.getElementById('monitor-next');
		if (!root || !screen || !segs) return;

		var cards = slice.call(document.querySelectorAll('#reels .card.js-play'));
		if (cards.length < 2) return;

		var clips = cards.map(function (card) {
			var img = card.querySelector('img');
			return {
				href: card.href,
				embed: card.dataset.embed,
				title: card.dataset.title || '',
				src: img ? img.getAttribute('src') : ''
			};
		});

		var frames = [screen.querySelector('.monitor__frame')];
		var bars = [];
		var index = 0;
		var userPaused = reducedMotion;
		var offscreen = false;

		clips.forEach(function (clip, i) {
			var bar = document.createElement('i');
			segs.appendChild(bar);
			bars.push(bar);
			if (i > 0) frames.push(null);
		});

		// The other thumbnails are fetched after the page has loaded, so they
		// never compete with the first paint.
		function loadFrames() {
			clips.forEach(function (clip, i) {
				if (i === 0 || frames[i] || !clip.src) return;
				var img = new Image();
				img.alt = '';
				img.decoding = 'async';
				img.className = 'monitor__frame';
				img.src = clip.src;
				screen.insertBefore(img, segs);
				frames[i] = img;
			});
		}

		function ready(i) { return frames[i] && frames[i].complete && frames[i].naturalWidth > 0; }

		function cut(to) {
			var n = clips.length;
			to = (to + n) % n;
			// Skip any frame that has not finished downloading yet.
			for (var tries = 0; tries < n && !ready(to); tries++) to = (to + 1) % n;
			if (!ready(to)) to = 0;

			index = to;
			frames.forEach(function (img, i) { if (img) img.classList.toggle('is-on', i === index); });
			bars.forEach(function (bar, i) {
				bar.classList.remove('is-on');
				bar.classList.toggle('is-done', i < index);
			});
			void segs.offsetWidth;                       // restart the fill animation
			bars[index].classList.add('is-on');

			var clip = clips[index];
			screen.href = clip.href;
			screen.dataset.embed = clip.embed;
			screen.dataset.title = clip.title;
			screen.setAttribute('aria-label', 'Play ' + clip.title);
			titleEls.forEach(function (el) { el.textContent = clip.title; });
			if (countEl) countEl.textContent = (index + 1) + ' / ' + n;
		}

		function sync() {
			var paused = userPaused || offscreen || document.hidden;
			root.classList.toggle('is-paused', paused);
			if (toggle) {
				toggle.textContent = userPaused ? 'Play' : 'Pause';
				toggle.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
			}
			if (!paused) startClock(); else stopClock();
		}

		// Running timecode in the corner (hours:minutes:seconds:frames at 30fps).
		var played = 0, lastTick = 0, clock = 0;
		function two(v) { return (v < 10 ? '0' : '') + v; }
		function tick(now) {
			played += now - lastTick;
			lastTick = now;
			if (tcEl) {
				var s = Math.floor(played / 1000);
				tcEl.textContent = two(Math.floor(s / 3600)) + ':' + two(Math.floor(s / 60) % 60) + ':' + two(s % 60) + ':' + two(Math.floor((played % 1000) * 30 / 1000));
			}
			clock = requestAnimationFrame(tick);
		}
		function startClock() {
			if (clock) return;
			lastTick = performance.now();
			clock = requestAnimationFrame(tick);
		}
		function stopClock() {
			if (clock) cancelAnimationFrame(clock);
			clock = 0;
		}

		segs.addEventListener('animationend', function (e) {
			if (e.target === bars[index]) cut(index + 1);
		});

		if (toggle) toggle.addEventListener('click', function () { userPaused = !userPaused; sync(); });
		if (nextBtn) nextBtn.addEventListener('click', function () { cut(index + 1); });
		document.addEventListener('visibilitychange', sync);

		if ('IntersectionObserver' in window) {
			new IntersectionObserver(function (entries) {
				offscreen = !entries[0].isIntersecting;
				sync();
			}).observe(root);
		}

		if (document.readyState === 'complete') loadFrames();
		else window.addEventListener('load', loadFrames);

		if (foot) foot.hidden = false;
		if (reducedMotion && toggle) toggle.hidden = true;   // nothing to pause when the clips do not advance on their own
		root.classList.add('is-live');
		cut(0);
		sync();
	})();

	/* ---------- 5. Contact form ---------- */

	(function contactForm() {
		var form = document.getElementById('contact-form');
		var status = document.getElementById('form-status');
		var sent = document.getElementById('form-sent');
		var again = document.getElementById('form-again');
		if (!form || !status || !window.fetch) return;   // falls back to a normal form post

		var checks = {
			name: function (v) { return v ? '' : 'Add your name.'; },
			email: function (v) {
				if (!v) return 'Add your email so I can reply.';
				return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'This email address looks incomplete.';
			},
			message: function (v) { return v ? '' : 'Write a short message about your project.'; }
		};

		function say(text, kind) {
			status.textContent = text;
			status.className = 'form__status' + (kind ? ' is-' + kind : '');
		}

		function check(name) {
			var input = form.elements[name];
			var note = document.getElementById(name + '-error');
			var problem = checks[name](input.value.trim());
			input.setAttribute('aria-invalid', problem ? 'true' : 'false');
			if (note) { note.textContent = problem; note.hidden = !problem; }
			return !problem;
		}

		Object.keys(checks).forEach(function (name) {
			var input = form.elements[name];
			input.addEventListener('blur', function () { if (input.value.trim()) check(name); });
			input.addEventListener('input', function () {
				if (input.getAttribute('aria-invalid') === 'true') check(name);
			});
		});

		form.addEventListener('submit', function (event) {
			event.preventDefault();

			var bad = Object.keys(checks).filter(function (name) { return !check(name); });
			if (bad.length) {
				say('');
				form.elements[bad[0]].focus();
				return;
			}

			var button = form.querySelector('button[type="submit"]');
			button.disabled = true;
			say('Sending…');

			fetch(form.action, {
				method: 'POST',
				headers: { 'Accept': 'application/json' },
				body: new FormData(form)
			}).then(function (response) {
				if (response.ok) {
					form.reset();
					say('');
					if (sent) {
						form.hidden = true;
						sent.hidden = false;
						sent.focus();
					} else {
						say('Message sent. I will reply soon.', 'success');
					}
					return;
				}
				return response.json().then(function (data) {
					var detail = data && data.errors && data.errors.length
						? data.errors.map(function (e) { return e.message; }).join(', ')
						: (data && data.error) || '';
					throw new Error(detail);
				});
			}).catch(function (error) {
				say('Your message was not sent' + (error && error.message ? ' (' + error.message + ')' : '') + '. Check your connection and send it again.', 'error');
			}).then(function () {
				button.disabled = false;
			});
		});

		if (again && sent) {
			again.addEventListener('click', function () {
				sent.hidden = true;
				form.hidden = false;
				form.elements['name'].focus();
			});
		}
	})();
})();
