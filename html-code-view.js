const Workflow = require("@saltcorn/data/models/workflow");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const { freeVariables } = require("@saltcorn/data/models/expression");
const Handlebars = require("handlebars");
const { getState, features } = require("@saltcorn/data/db/state");
const { div } = require("@saltcorn/markup/tags");

const {
  stateFieldsToWhere,
  readState,
  add_free_variables_to_joinfields,
} = require("@saltcorn/data/plugin-helper");
const { mergeIntoWhere } = require("@saltcorn/data/utils");
const vm = require("vm");

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "Code",
        form: async (context) => {
          const table = await Table.findOne({ id: context.table_id });
          const fields = table.fields;
          return new Form({
            fields: [
              {
                name: "row_count",
                label: "Row count",
                type: "String",
                required: true,
                attributes: { options: ["Single", "Many"] },
              },
              {
                name: "code",
                label: "HTML Code",
                input_type: "code",
                attributes: { mode: "text/html" },
              },
              {
                input_type: "section_header",
                label: " ",
                sublabel: div(
                  "Use handlebars to access table rows. Example: <code>{{#each rows}}&lt;h1&gt;{{this.name}}&lt;/h1&gt;{{/each}}</code>"
                ),
                showIf: { row_count: "Many" },
              },
              {
                input_type: "section_header",
                label: " ",
                sublabel: div(
                  "Use handlebars to access rows. Example: <code>&lt;h1&gt;{{name}}&lt;/h1&gt;</code>. Variables in scope: " +
                    fields.map((f) => `<code>${f.name}</code>`).join(", ")
                ),
                showIf: { row_count: "Single" },
              },
            ],
          });
        },
      },
    ],
  });

const get_state_fields = () => [
  {
    name: "id",
    type: "Integer",
    required: false,
  },
];

const run = async (
  table_id,
  viewname,
  { code, row_count },
  state,
  extraArgs,
  queriesObj
) => {
  const rows = queriesObj?.get_rows_query
    ? await queriesObj.get_rows_query(state)
    : await getRowsImpl(table_id, { code }, state);

  const template = Handlebars.compile(code || "");
  if (row_count === "Many") return template({ rows });
  else {
    if (rows.length === 0) return "";
    const row = rows[0];
    return template({ ...row, row });
  }
};

const extractVariables = (template) => {
  const ast = Handlebars.parse(template);
  const variables = new Set();

  const extractFromNode = (node) => {
    if (node.type === 'MustacheStatement' || node.type === 'BlockStatement') {
      variables.add(node.path.original);
    }
    if (node.program) {
      node.program.body.forEach(extractFromNode);
    }
    if (node.inverse) {
      node.inverse.body.forEach(extractFromNode);
    }
  };

  ast.body.forEach(extractFromNode);
  return variables;
};

const getRowsImpl = async (table_id, { code }, state) => {
  const table = await Table.findOne(table_id);
  const fields = await table.getFields();
  readState(state, fields);
  const qstate = await stateFieldsToWhere({ fields, state });
  const joinFields = {};
  const freeVars = new Set([]);
  
  // Extract Handlebars variables
  const hbVars = extractVariables(code);
  hbVars.forEach((hbVar) => {
    freeVariables(hbVar).forEach((fv) => freeVars.add(fv));
  });

  add_free_variables_to_joinfields(freeVars, joinFields, fields);
  return await table.getJoinedRows({
    where: qstate,
    joinFields,
  });
};

module.exports = {
  name: "HtmlCodeView",
  display_state_form: false,
  run,
  get_state_fields,
  configuration_workflow,
  queries: ({ table_id, configuration: { code } }) => ({
    async get_rows_query(state) {
      return await getRowsImpl(table_id, { code }, state);
    },
  }),
};
