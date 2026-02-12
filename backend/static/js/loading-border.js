/**
 * =============================================================================
 * Loading Border Animation - JavaScript Controller
 * =============================================================================
 * Automatically applies loading border animation to buttons during HTMX requests
 * 
 * Usage:
 * 1. Include this script after HTMX
 * 2. Add data-loading-border attribute to forms or buttons to enable
 *    - data-loading-border="primary" (default blue)
 *    - data-loading-border="danger" (red)
 *    - data-loading-border="warning" (yellow)
 *    - data-loading-border="info" (cyan)
 *    - data-loading-border="success" (green)
 * 
 * Alternatively, buttons within forms that have hx-post/hx-get will auto-animate
 * =============================================================================
 */

(function () {
    'use strict';

    // Store original button states
    var buttonStates = new WeakMap();

    /**
     * Get the color variant class for loading border
     */
    function getLoadingClass(variant) {
        if (!variant || variant === 'primary' || variant === 'true') {
            return 'loading-border';
        }
        return 'loading-border loading-border-' + variant;
    }

    /**
     * Find the submit button for a form
     */
    function findSubmitButton(form) {
        // Try to find the submit button
        var btn = form.querySelector('button[type="submit"]');
        if (!btn) {
            btn = form.querySelector('input[type="submit"]');
        }
        if (!btn) {
            btn = form.querySelector('button:not([type="button"])');
        }
        return btn;
    }

    /**
     * Apply loading state to a button
     */
    function applyLoadingState(btn, variant) {
        if (!btn || btn.classList.contains('loading-border')) return;

        // Store original state
        buttonStates.set(btn, {
            disabled: btn.disabled,
            innerHTML: btn.innerHTML
        });

        // Get variant from button or use default
        var loadingVariant = variant || btn.dataset.loadingBorder || 'primary';

        // Determine variant from button class if not specified
        if (loadingVariant === 'primary' || loadingVariant === 'true') {
            if (btn.classList.contains('btn-danger')) loadingVariant = 'danger';
            else if (btn.classList.contains('btn-warning')) loadingVariant = 'warning';
            else if (btn.classList.contains('btn-info')) loadingVariant = 'info';
            else if (btn.classList.contains('btn-success')) loadingVariant = 'success';
        }

        // Apply loading classes
        var classes = getLoadingClass(loadingVariant).split(' ');
        classes.forEach(function (cls) {
            btn.classList.add(cls);
        });

        // Disable button
        btn.disabled = true;

        // Add spinner to button text if it doesn't already have one
        if (!btn.querySelector('.fa-spinner')) {
            var icon = btn.querySelector('i.fas, i.far, i.fab');
            if (icon) {
                icon.dataset.originalClass = icon.className;
                icon.className = 'fas fa-spinner fa-spin me-2';
            }
        }
    }

    /**
     * Remove loading state from a button
     */
    function removeLoadingState(btn) {
        if (!btn) return;

        // Remove loading classes
        btn.classList.remove('loading-border', 'loading-border-primary',
            'loading-border-danger', 'loading-border-warning',
            'loading-border-info', 'loading-border-success');

        // Restore original state
        var state = buttonStates.get(btn);
        if (state) {
            btn.disabled = state.disabled;
            buttonStates.delete(btn);
        } else {
            btn.disabled = false;
        }

        // Restore icon
        var icon = btn.querySelector('i[data-original-class]');
        if (icon) {
            icon.className = icon.dataset.originalClass;
            delete icon.dataset.originalClass;
        }
    }

    /**
     * Initialize loading border for HTMX requests
     */
    function init() {
        // Before HTMX request starts
        document.body.addEventListener('htmx:beforeRequest', function (evt) {
            var elt = evt.detail.elt;
            var btn = null;

            // If the element is a form, find its submit button
            if (elt.tagName === 'FORM') {
                btn = findSubmitButton(elt);
            } else if (elt.tagName === 'BUTTON' || elt.tagName === 'INPUT') {
                btn = elt;
            }

            // Check if this form/button should have loading animation
            // Auto-enable for forms with hx-post that contain database operations
            var shouldAnimate = false;
            var variant = 'primary';

            if (elt.hasAttribute('data-loading-border')) {
                shouldAnimate = true;
                variant = elt.dataset.loadingBorder || 'primary';
            } else if (btn && btn.hasAttribute('data-loading-border')) {
                shouldAnimate = true;
                variant = btn.dataset.loadingBorder || 'primary';
            } else {
                // Auto-detect database operation forms
                var hxPost = elt.getAttribute('hx-post') || '';
                var autoPatterns = [
                    'backup', 'restore', 'clean', 'delete', 'create', 'update',
                    'execute', 'generate', 'wizard', 'batch', 'cogs', 'upload',
                    'start_generation', 'etl'
                ];
                for (var i = 0; i < autoPatterns.length; i++) {
                    if (hxPost.toLowerCase().indexOf(autoPatterns[i]) !== -1) {
                        shouldAnimate = true;
                        break;
                    }
                }
            }

            if (shouldAnimate && btn) {
                applyLoadingState(btn, variant);
            }
        });

        // After HTMX request completes (success or error)
        document.body.addEventListener('htmx:afterRequest', function (evt) {
            var elt = evt.detail.elt;
            var btn = null;

            if (elt.tagName === 'FORM') {
                btn = findSubmitButton(elt);
            } else if (elt.tagName === 'BUTTON' || elt.tagName === 'INPUT') {
                btn = elt;
            }

            if (btn) {
                removeLoadingState(btn);
            }
        });

        console.log('✨ Loading Border Animation initialized');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export for manual use
    window.LoadingBorder = {
        apply: applyLoadingState,
        remove: removeLoadingState
    };

})();
