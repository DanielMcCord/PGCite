import { } from "node:readline";
import { } from "@citation-js/plugin-wikidata";
import { QueryEngine } from "@comunica/query-sparql";

// https://stackoverflow.com/questions/29601839/standard-regex-to-prevent-sparql-injection/55726984#55726984
function escapeSPARQL(str: string) {
  return str.replace(/(["'\\])/g, "\\$1");
}

// Make a request to the Wikidata SPAQL API, using a given SPARQL query (as it would be entered in https://query.wikidata.org/)
// Returns an array of bindings (https://comunica.dev/docs/query/getting_started/query_app/#3-3-consuming-binding-results-as-an-array)
async function makeRequest(query: string) {
  const queryWithPrefixes = `
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
${query}`;

  const bindingsStream = await new QueryEngine().queryBindings(queryWithPrefixes, {
    sources: ["https://query.wikidata.org/sparql"],
  });

  return await bindingsStream
    .on("error", (error) => {
      console.log(error);
    })
    .toArray();
}

class Person {
  name: string;
  description: string;
  id: string;

  constructor(name: string, description: string, id: string) {
    this.name = name;
    this.description = description;
    this.id = id;
  }

  toString() {
    return `${this.id}: ${this.name} (${this.description})`;
  }
}

// Get a list of authors with an exact name (e.g. "Douglas Adams")
async function getAuthors(name: string) {
  const queryForAuthors = `
  SELECT ?id ?name ?description WHERE {
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }

  VALUES ?name {
    "${escapeSPARQL(name)}"@en
  }

  ?id rdfs:label ?name;
    schema:description ?description.

  FILTER((LANG(?name)) = "en")
  FILTER((LANG(?description)) = "en")
}`;

  const result: Person[] = (await makeRequest(queryForAuthors)).map((binding) => {
    return new Person(
      // How to check that these values are not undefined (TS error 2532)?
      binding.get("name").value,
      binding.get("description").value,
      binding.get("id").value,
    );
  });

  return result;
}

class Field {
  label: string;
  value: string;

  constructor(label: string, value: string) {
    this.label = label;
    this.value = value;
  }

  toString() {
    return `${this.label}: ${this.value}`;
  }
}

// Get information about a given author, using an exact ID (ex. Q42)
async function getAuthorInfo(id: string) {
  const query = `
SELECT DISTINCT ?related ?relatedLabel WHERE {
  VALUES ?target {
    wd:${escapeSPARQL(id)}
  }
  { ?target ?prop ?related. }
  UNION
  { ?related ?prop ?target. }
  FILTER(CONTAINS(STR(?related), "/entity/Q"))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY (UCASE(?relatedLabel))`;

  // How to get all values of fields with multiple values (ex. multiple occupations)?
  const result: Field[] = (await makeRequest(query)).map((binding) => {
    return new Field(binding.get("relatedLabel").value, binding.get("related").value);
  });

  return result;
}

console.log(await getAuthors("William Carpenter"), await getAuthorInfo("Q8006577"));
