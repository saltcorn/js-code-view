const Workflow = require("@saltcorn/data/models/workflow");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const Handlebars = require("handlebars");
const { getState, features } = require("@saltcorn/data/db/state");

const { stateFieldsToWhere } = require("@saltcorn/data/plugin-helper");
const { mergeIntoWhere } = require("@saltcorn/data/utils");
const vm = require("vm");

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "Code",
        form: () => {
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
            ],
          });
        },
      },
    ],
  });

const get_state_fields = () => [];

const run = async (
  table_id,
  viewname,
  { code, row_count },
  state,
  extraArgs
) => {
  const table = await Table.findOne(table_id);
  const fields = await table.getFields();
  readState(state, fields);
  const qstate = await stateFieldsToWhere({ fields, state });
  const rows = await table.getJoinedRows({
    where: qstate,
    //joinFields: buildJoinFields(event_color),
  });
  const template = Handlebars.compile(code);
  if (row_count === "Many") return template(rows);
  else {
    if (rows.length === 0) return "";
    const row = rows[0];
    return template({ ...row, row });
  }
};

module.exports = {
  name: "HtmlCodeView",
  display_state_form: false,
  run,
  get_state_fields,
  configuration_workflow,
};