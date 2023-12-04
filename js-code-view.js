const markupTags = require("@saltcorn/markup/tags");
const View = require("@saltcorn/data/models/view");
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
                      async function () {}
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
  extraArgs
) => {
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
	    $('#jsv${rndid}').html(out);`)
      )
    );
  }

  const user = extraArgs.req.user;
  const Actions = {};
  Object.entries(getState().actions).forEach(([k, v]) => {
    Actions[k] = (args = {}) => {
      v.run({ row, table, user, configuration: args, ...args });
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
        ...rest,
        ...args,
      });
    };
  }
  const emitEvent = (eventType, channel, payload) =>
    Trigger.emitEvent(eventType, channel, user, payload);

  const f = vm.runInNewContext(`async () => {${code}\n}`, {
    Table,
    user,
    console,
    Actions,
    View,
    emitEvent,
    markupTags,
    db,
    req: extraArgs.req,
    state,
    ...getState().function_context,
  });
  return await f();
};

module.exports = {
  name: "JsCodeView",
  display_state_form: false,
  tableless: true,
  run,
  get_state_fields,
  configuration_workflow,
};
