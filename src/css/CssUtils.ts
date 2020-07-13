import * as postcss from 'postcss';

/**
 * Utility methods for CSS injection/removal, selector validation.
 */
const STYLE_ELEMENT_ID = 'stylebot-css';

const getGoogleFontUrlAndParams = (
  value: string
): { url: string; params: string } => {
  const arg = value.replace(' ', '+');
  const url = `//fonts.googleapis.com/css?family=${arg}`;
  const params = `url(${url})`;

  return { url, params };
};

const CSSUtils = {
  /**
   * Add declaration for given selector and css
   */
  addDeclaration(
    property: string,
    value: string,
    selector: string,
    css: string
  ): string {
    const root = postcss.parse(css);
    const rules: Array<postcss.Rule> = [];

    root.walkRules(selector, rule => rules.push(rule));
    const rule = rules.length > 0 ? rules[0] : null;

    if (!rule) {
      if (value) {
        const ruleCss = `${selector} {\n  ${property}: ${value};\n}`;

        if (root.some(rule => !!rule)) {
          root.append(`\n\n${ruleCss}`);
        } else {
          root.append(ruleCss);
        }

        return root.toString();
      }

      return css;
    }

    const declarationExists = rule.some(
      decl => decl.type === 'decl' && decl.prop === property
    );

    if (declarationExists) {
      rule.walkDecls(property, (decl: postcss.Declaration) => {
        if (value) {
          decl.value = value;
        } else {
          decl.remove();
        }
      });

      if (!rule.some(decl => !!decl)) {
        rule.remove();
      }

      return root.toString();
    }

    if (value) {
      rule.append(`\n  ${property}: ${value};`);
      return root.toString();
    }

    return css;
  },

  /**
   * If font exists in https://developers.google.com/fonts, add relevant @import to the css.
   * Guards against duplicate @import and invalid fonts.
   */
  addGoogleWebFont: async (value: string, css: string): Promise<string> => {
    const root = postcss.parse(css);
    const { url, params } = getGoogleFontUrlAndParams(value);

    return new Promise(resolve => {
      fetch(url)
        .then(response => {
          if (response.status === 400) {
            resolve(css);
            return;
          }

          let importExists = false;
          root.walkAtRules('import', (atRule: postcss.AtRule) => {
            if (atRule.params === params) {
              importExists = true;
            }
          });

          if (!importExists) {
            const rule = postcss.parse(`@import ${params};`);
            root.prepend(rule);

            const next = root.first?.next();
            if (next) {
              next.raws.before = '\n\n';
            }
          }

          resolve(root.toString());
        })
        .catch(() => {
          resolve(css);
        });
    });
  },

  /**
   * Remove unused google web fonts from given css.
   */
  cleanGoogleWebFonts: (css: string): string => {
    const root = postcss.parse(css);
    const fonts: Array<string> = [];

    root.walkDecls('font-family', decl => {
      const declFonts = decl.value.split(',');

      declFonts.forEach(value => {
        const trimmedValue = value.trim();

        if (trimmedValue && fonts.indexOf(trimmedValue) === -1) {
          fonts.push(trimmedValue);
        }
      });
    });

    const fontParams = fonts.map(
      font => getGoogleFontUrlAndParams(font).params
    );

    root.walkAtRules('import', (atRule: postcss.AtRule) => {
      if (fontParams.indexOf(atRule.params) === -1) {
        atRule.remove();
      }
    });

    return root.toString();
  },

  validateSelector: (selector: string): boolean => {
    if (!selector) {
      return false;
    }

    try {
      document.querySelector(selector);
      return true;
    } catch (e) {
      return false;
    }
  },

  injectCSSIntoDocument: (css: string): void => {
    const el = document.getElementById(STYLE_ELEMENT_ID);

    if (el) {
      el.innerHTML = css;
      return;
    }

    const style = document.createElement('style');

    style.type = 'text/css';
    style.setAttribute('id', STYLE_ELEMENT_ID);
    style.appendChild(document.createTextNode(css));

    document.documentElement.appendChild(style);
  },

  injectRootIntoDocument: (root: postcss.Root): void => {
    const rootWithImportant = root.clone();
    rootWithImportant.walkDecls(decl => (decl.important = true));

    const css = rootWithImportant.toString();
    CSSUtils.injectCSSIntoDocument(css);
  },

  removeCSSFromDocument: (): void => {
    const el = document.getElementById(STYLE_ELEMENT_ID);

    if (el) {
      el.innerHTML = '';
    }
  },
};

export default CSSUtils;