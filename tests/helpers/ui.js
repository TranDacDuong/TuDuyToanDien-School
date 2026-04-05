function firstVisible(page, selectors) {
  return page.locator(selectors.join(", ")).first();
}

module.exports = {
  firstVisible,
};
