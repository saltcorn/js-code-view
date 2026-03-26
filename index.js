module.exports = {
  sc_plugin_api_version: 1,
  viewtemplates: [require("./js-code-view.js"), require("./html-code-view.js")],
  table_providers: require("./table-provider.js"),
  ready_for_mobile: true,
};
