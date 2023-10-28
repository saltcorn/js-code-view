const { getState } = require("@saltcorn/data/db/state");
const View = require("@saltcorn/data/models/view");
const Table = require("@saltcorn/data/models/table");
const { mockReqRes } = require("@saltcorn/data/tests/mocks");
const { afterAll, beforeAll, describe, it, expect } = require("@jest/globals");

afterAll(require("@saltcorn/data/db").close);
beforeAll(async () => {
  await require("@saltcorn/data/db/reset_schema")();
  await require("@saltcorn/data/db/fixtures")();

  getState().registerPlugin("base", require("@saltcorn/data/base-plugin"));
  getState().registerPlugin("@saltcorn/code-view", require(".."));
});

describe("html code view", () => {
  it("run count_books", async () => {
    const table = Table.findOne("books");
    const view = await View.create({
      name: "bookhtmlview",
      table_id: table.id,
      configuration: {
        row_count: "Single",
        code: `<h1>{{author}}</h1>`,
      },
    });
    const result = await view.run({ id: 1 }, mockReqRes);

    expect(result).toBe(`<h1>Merman Melville</h1>`);
  });
});
