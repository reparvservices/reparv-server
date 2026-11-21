import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { collectPropertyColumns } from "../src/core/utils/propertyColumns.js";

const asMap = ({ columns, values }) => Object.fromEntries(columns.map((c, i) => [c, values[i]]));

const listing = {
  projectBy: "Sharma Realty",
  contact: "9876543210",
  email: "Owner@Example.com",
  address: "Civil Lines, Nagpur",
  pincode: "440001",
  latitude: 21.1458,
  longitude: 79.0882,
  totalSalesPrice: 5000000,
  totalOfferPrice: 4500000,
  builtUpArea: "1200",
  furnishing: "Semi-furnished",
  propertyType: ["2 BHK"],
  amenitiesFeature: ["Lift", "Gym"],
  frontView: ["https://cdn.test/a.jpg"],
};

describe("collectPropertyColumns: add (admin, partner, website)", () => {
  for (const privileged of [true, false]) {
    const who = privileged ? "admin/partner" : "website user";

    test(`${who}: a complete listing stores every field`, () => {
      const out = collectPropertyColumns(listing, { mode: "add", privileged });
      assert.equal(out.error, undefined);
      const m = asMap(out);
      assert.equal(m.contact, "9876543210");
      assert.equal(m.address, "Civil Lines, Nagpur");
      assert.equal(m.pincode, "440001");
      assert.equal(m.latitude, "21.14580000");
      assert.equal(m.longitude, "79.08820000");
      assert.equal(m.furnishing, "Semi-furnished");
      assert.deepEqual(JSON.parse(m.amenitiesFeature), ["Lift", "Gym"]);
      assert.deepEqual(JSON.parse(m.frontView), ["https://cdn.test/a.jpg"]);
    });

    test(`${who}: email is saved lower-case and trimmed`, () => {
      const m = asMap(collectPropertyColumns({ ...listing, email: "  Owner@Example.COM " }, { mode: "add", privileged }));
      assert.equal(m.email, "owner@example.com");
    });

    test(`${who}: a blank email is simply not stored on add`, () => {
      const m = asMap(collectPropertyColumns({ ...listing, email: "" }, { mode: "add", privileged }));
      assert.equal("email" in m, false);
    });

    for (const bad of ["abc", "a@b", "a b@c.com", "@x.com", "x@y.c", `${"a".repeat(250)}@x.com`]) {
      test(`${who}: rejects bad email ${JSON.stringify(bad.slice(0, 20))}`, () => {
        assert.match(collectPropertyColumns({ ...listing, email: bad }, { mode: "add", privileged }).error, /email/i);
      });
    }

    for (const bad of ["12345", "5876543210", "98765432101", "abcdefghij"]) {
      test(`${who}: rejects bad contact ${bad}`, () => {
        assert.match(collectPropertyColumns({ ...listing, contact: bad }, { mode: "add", privileged }).error, /contact/i);
      });
    }

    test(`${who}: rejects a bad pincode and bad map location`, () => {
      assert.match(collectPropertyColumns({ ...listing, pincode: "012345" }, { mode: "add", privileged }).error, /pincode/i);
      assert.match(collectPropertyColumns({ ...listing, latitude: 123 }, { mode: "add", privileged }).error, /location/i);
      assert.match(collectPropertyColumns({ ...listing, longitude: "x" }, { mode: "add", privileged }).error, /location/i);
    });

    test(`${who}: description over the limit is rejected`, () => {
      assert.match(
        collectPropertyColumns({ ...listing, propertyDescription: "x".repeat(3001) }, { mode: "add", privileged }).error,
        /Description/,
      );
    });
  }

  test("only admin/partner can set builder and approval columns", () => {
    const body = { ...listing, builderid: 7, propertyApprovedBy: "admin" };
    const priv = asMap(collectPropertyColumns(body, { mode: "add", privileged: true }));
    const user = asMap(collectPropertyColumns(body, { mode: "add", privileged: false }));
    assert.equal(priv.builderid, "7");
    assert.equal(priv.propertyApprovedBy, "admin");
    assert.equal("builderid" in user, false);
    assert.equal("propertyApprovedBy" in user, false);
  });

  test("a customer cannot make their own listing approved, active or owned by someone else", () => {
    const m = asMap(
      collectPropertyColumns(
        { ...listing, approve: "Approved", status: "Active", guestUserId: 99, projectpartnerid: 99 },
        { mode: "add", privileged: false },
      ),
    );
    for (const col of ["approve", "status", "guestUserId", "projectpartnerid"]) {
      assert.equal(col in m, false, `${col} must not be settable from the form`);
    }
    const p = asMap(
      collectPropertyColumns({ ...listing, approve: "Approved", status: "Active" }, { mode: "add", privileged: true }),
    );
    assert.equal("approve" in p, false);
    assert.equal("status" in p, false);
  });

  test("photo sections default to an empty list on add", () => {
    const m = asMap(collectPropertyColumns({ contact: "9876543210" }, { mode: "add", privileged: false }));
    assert.equal(m.sideView, "[]");
  });
});

describe("collectPropertyColumns: edit", () => {
  test("only keys the form sent are changed", () => {
    const out = collectPropertyColumns({ furnishing: "Furnished" }, { mode: "edit", privileged: true });
    assert.deepEqual(out.columns.filter((c) => c === "furnishing"), ["furnishing"]);
    assert.equal(out.columns.includes("contact"), false);
    assert.equal(out.columns.includes("frontView"), false, "omitting photos keeps the stored ones");
  });

  test("an empty value clears an optional field", () => {
    const m = asMap(collectPropertyColumns({ email: "", furnishing: "" }, { mode: "edit", privileged: false }));
    assert.equal(m.email, null);
    assert.equal(m.furnishing, null);
  });

  test("edit validates contact, email and pincode the same as add", () => {
    assert.match(collectPropertyColumns({ contact: "123" }, { mode: "edit", privileged: false }).error, /contact/i);
    assert.match(collectPropertyColumns({ email: "nope" }, { mode: "edit", privileged: false }).error, /email/i);
    assert.match(collectPropertyColumns({ pincode: "99" }, { mode: "edit", privileged: true }).error, /pincode/i);
  });

  test("new photos replace the section, an empty list keeps it", () => {
    const m = asMap(collectPropertyColumns({ frontView: ["https://cdn.test/new.jpg"], sideView: [] }, { mode: "edit", privileged: true }));
    assert.deepEqual(JSON.parse(m.frontView), ["https://cdn.test/new.jpg"]);
    assert.equal("sideView" in m, false);
  });

  test("a stored list round-trips through an edit (JSON text in, same list out)", () => {
    const stored = JSON.stringify(["Lift", "Gym"]);
    const m = asMap(collectPropertyColumns({ amenitiesFeature: stored }, { mode: "edit", privileged: false }));
    assert.deepEqual(JSON.parse(m.amenitiesFeature), ["Lift", "Gym"]);
  });
});

describe("collectPropertyColumns: removing saved photos (replacePhotos)", () => {
  const edit = (body, privileged = true) => collectPropertyColumns(body, { mode: "edit", privileged });

  test("a section named in replacePhotos is replaced by exactly the list sent, even a shorter one", () => {
    const m = asMap(edit({ replacePhotos: ["sideView"], sideView: ["https://cdn.test/keep.jpg"] }));
    assert.deepEqual(JSON.parse(m.sideView), ["https://cdn.test/keep.jpg"]);
  });

  test("…and an optional section can be emptied", () => {
    const m = asMap(edit({ replacePhotos: ["kitchenView"], kitchenView: [] }));
    assert.equal(m.kitchenView, "[]");
  });

  test("the front view can be replaced but never emptied", () => {
    assert.match(edit({ replacePhotos: ["frontView"], frontView: [] }).error, /front view/i);
    assert.deepEqual(JSON.parse(asMap(edit({ replacePhotos: ["frontView"], frontView: ["https://cdn.test/f.jpg"] })).frontView), ["https://cdn.test/f.jpg"]);
  });

  test("without replacePhotos an empty or missing section keeps the saved photos (old behaviour)", () => {
    const m = asMap(edit({ kitchenView: [], sideView: "[]", hallView: "" }));
    for (const k of ["kitchenView", "sideView", "hallView"]) assert.equal(k in m, false, k);
  });

  test("only the named sections are touched", () => {
    const m = asMap(edit({ replacePhotos: ["sideView"], sideView: [], hallView: [], frontView: [] }));
    assert.equal("sideView" in m, true);
    assert.equal("hallView" in m, false);
    assert.equal("frontView" in m, false);
  });

  test("replacePhotos is ignored when adding, and for unknown names", () => {
    const added = asMap(collectPropertyColumns({ replacePhotos: ["frontView"], frontView: ["https://cdn.test/a.jpg"] }, { mode: "add", privileged: true }));
    assert.deepEqual(JSON.parse(added.frontView), ["https://cdn.test/a.jpg"]);
    assert.equal(Object.keys(asMap(edit({ replacePhotos: ["notASection"] }))).length, 0);
  });

  test("the same rule for the website user", () => {
    const m = asMap(edit({ replacePhotos: ["balconyView"], balconyView: [] }, false));
    assert.equal(m.balconyView, "[]");
  });
});
