const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const View = require("@saltcorn/data/models/view");
const User = require("@saltcorn/data/models/user");
const File = require("@saltcorn/data/models/file");
const { getState } = require("@saltcorn/data/db/state");
const { mkTable } = require("@saltcorn/markup");
const { pre, code } = require("@saltcorn/markup/tags");
const vm = require("vm");

const runCode = async (codeStr, where, req) => {
  const f = vm.runInNewContext(`async () => {${codeStr}\n}`, {
    Table,
    state: where || {},
    req,
    View,
    User,
    File,
    user: req?.user,
    console,
    require,
    ...getState().function_context,
  });
  return await f();
};

const jsTypeGuess = (val) => {
  if (val === null || val === undefined) return "String";
  switch (typeof val) {
    case "number":
      return Number.isInteger(val) ? "Integer" : "Float";
    case "boolean":
      return "Bool";
    case "object":
      if (val instanceof Date) return "Date";
      return "JSON";
    default:
      return "String";
  }
};

const configuration_workflow = (req) =>
  new Workflow({
    steps: [
      {
        name: "code",
        form: async () => {
          return new Form({
            fields: [
              {
                name: "code",
                label: "Code",
                sublabel:
                  "Write JavaScript code that returns an array of objects. Each object represents a row.",
                input_type: "code",
                attributes: { mode: "application/javascript" },
                validator(s) {
                  try {
                    let AsyncFunction = Object.getPrototypeOf(
                      async function () {},
                    ).constructor;
                    AsyncFunction(s);
                    return true;
                  } catch (e) {
                    return e.message;
                  }
                },
              },
            ],
          });
        },
      },
      {
        name: "columns",
        form: async (context) => {
          let rows = [];
          let error;
          try {
            rows = await runCode(context.code, {}, req);
            if (!Array.isArray(rows)) {
              error = "Code did not return an array";
              rows = [];
            }
          } catch (e) {
            error = e.message;
            rows = [];
          }

          const tables = await Table.find({});
          const fkey_opts = [
            "File",
            ...tables
              .filter((t) => !t.provider_name && !t.external)
              .map((t) => `Key to ${t.name}`),
          ];

          const previewRows = rows.slice(0, 5);
          const colNames = previewRows.length
            ? Object.keys(previewRows[0])
            : [];
          const tbl = previewRows.length
            ? mkTable(
                colNames.map((name) => ({ label: name, key: name })),
                previewRows,
              )
            : "";
          const blurb = error
            ? pre(code(`Error: ${error}`))
            : tbl
              ? pre(code("Preview (first 5 rows):")) + tbl
              : pre(code("No rows returned"));

          const theForm = new Form({
            blurb,
            fields: [
              {
                input_type: "section_header",
                label: "Column types",
              },
              new FieldRepeat({
                name: "columns",
                fields: [
                  {
                    name: "name",
                    label: "Name",
                    type: "String",
                    required: true,
                  },
                  {
                    name: "label",
                    label: "Label",
                    type: "String",
                    required: true,
                  },
                  {
                    name: "type",
                    label: "Type",
                    type: "String",
                    required: true,
                    attributes: {
                      options: getState().type_names.concat(fkey_opts || []),
                    },
                  },
                  {
                    name: "primary_key",
                    label: "Primary key",
                    type: "Bool",
                  },
                ],
              }),
            ],
          });

          if (!context.columns || !context.columns.length) {
            if (!theForm.values) theForm.values = {};
            if (previewRows.length) {
              const sampleRow = previewRows[0];
              theForm.values.columns = colNames.map((name) => ({
                name,
                label: Field.nameToLabel(name),
                type: jsTypeGuess(sampleRow[name]),
              }));
            }
          }
          return theForm;
        },
      },
    ],
  });

module.exports = {
  "JavaScript code": {
    configuration_workflow,
    fields: (cfg) => cfg?.columns || [],
    get_table: (cfg) => ({
      getRows: async (where, opts) => {
        const rows = await runCode(cfg.code, where, opts);
        return Array.isArray(rows) ? rows : [];
      },
      countRows: async (where, opts) => {
        const rows = await runCode(cfg.code, where, opts);
        return Array.isArray(rows) ? rows.length : 0;
      },
    }),
  },
};
