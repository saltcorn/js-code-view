const markupTags = require("@saltcorn/markup/tags");
const View = require("@saltcorn/data/models/view");
const User = require("@saltcorn/data/models/user");
const File = require("@saltcorn/data/models/file");
const Workflow = require("@saltcorn/data/models/workflow");
const Table = require("@saltcorn/data/models/table");
const Trigger = require("@saltcorn/data/models/trigger");
const Form = require("@saltcorn/data/models/form");
const Field = require("@saltcorn/data/models/field");
const {
  jsexprToWhere,
  jsexprToSQL,
} = require("@saltcorn/data/models/expression");

const db = require("@saltcorn/data/db");
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
                name: "code",
                label: "Code",
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
              {
                name: "run_where",
                label: "Run where",
                input_type: "select",
                options: ["Server", "Client page"],
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
  { code, run_where },
  state,
  extraArgs,
  queriesObj,
) => {
  const table = Table.findOne(table_id);
  if (run_where === "Client page") {
    const rndid = Math.floor(Math.random() * 16777215).toString(16);
    return (
      markupTags.div({ id: `jsv${rndid}` }) +
      markupTags.script(
        markupTags.domReady(`
    const out = (()=>{
      ${code}
    })()
    if(typeof out !== "undefined" && out !==null)
	    $('#jsv${rndid}').html(out);`),
      )
    );
  }
  return queriesObj?.runCodeQuery
    ? await queriesObj.runCodeQuery(state)
    : await runCodeImpl({ code }, state, extraArgs.req);
};

const runCodeImpl = async ({ code }, state, req) => {
  const user = req.user;
  const Actions = {};
  Object.entries(getState().actions).forEach(([k, v]) => {
    Actions[k] = (args = {}) => {
      v.run({ user, configuration: args, ...args });
    };
  });
  const trigger_actions = await Trigger.find({
    when_trigger: { or: ["API call", "Never"] },
  });
  for (const trigger of trigger_actions) {
    const state_action = getState().actions[trigger.action];
    Actions[trigger.name] = (args = {}) => {
      state_action.run({
        configuration: trigger.configuration,
        user,
        ...args,
      });
    };
  }
  const emitEvent = (eventType, channel, payload) =>
    Trigger.emitEvent(eventType, channel, user, payload);
  const output = [];
  const fakeConsole = {
    log(...s) {
      console.log(...s);
      output.push([s, false]);
    },
    error(...s) {
      console.error(...s);
      output.push([s, true]);
    },
  };
  try {
    const f = vm.runInNewContext(`async () => {${code}\n}`, {
      Table,
      user,
      console: fakeConsole,
      Actions,
      View,
      User,
      File,
      emitEvent,
      markupTags,
      db,
      req: req,
      state,
      ...getState().function_context,
    });
    const runRes = await f();
    if (output.length > 0 && typeof runRes === "string")
      return (
        runRes +
        `<script>${output
          .map(
            ([s, isError]) =>
              `console.${isError ? "error" : "log"}(...${JSON.stringify(s)})`,
          )
          .join("\n")}</script>`
      );
    else return runRes;
  } catch (err) {
    if (output.length > 0)
      err.message += `\n\nConsole output:\n\n${output
        .map(([s, isError]) => s.map((x) => `${JSON.stringify(x)}`).join(" "))
        .join("\n")}`;
    throw err;
  }
};

module.exports = {
  name: "JsCodeView",
  display_state_form: false,
  tableless: true,
  run,
  get_state_fields,
  configuration_workflow,
  queries: ({ configuration: { code }, req }) => ({
    async runCodeQuery(state) {
      return await runCodeImpl({ code }, state, req);
    },
  }),
  copilot_generate_view_prompt: getState().functions.copilot_standard_prompt
    ? async () => {
        const table_prompt =
          await getState().functions.copilot_standard_prompt.run({
            language: "javascript",
            has_table: true,
            has_functions: true,
          });
        return `You are generating JavaScript code which will return the html to be displayed as a string.
        The view can run in two different modes: Server and Client page. 
        
        in both cases, you write asyncronous code that returns an HTML string. you can use await at the top level. 
        The HTML you return will be inserted in an element on an existing page; do not include head and body tags.

        If you select Client page mode, the code will run in the browser. You can use jQuery and bootstrap code. 
        
        If you select Server mode, you do not have access to the browser client environment, all code will be run 
        on the server. But you can access the database with the Table object. In this case there is no associated single table.
        
        ${table_prompt}        
        `;
      }
    : undefined,
};
