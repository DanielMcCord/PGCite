import { } from "@citation-js/plugin-wikidata";
import { QueryEngine } from "@comunica/query-sparql";

let authorDescriptions = []

// https://stackoverflow.com/questions/29601839/standard-regex-to-prevent-sparql-injection/55726984#55726984
function escapeSPARQL(str: string) {
  str.replace(/(["'\\])/g, "\\$1");
}

async function getAuthors(id: string) {
  const queryForAuthors = `
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
SELECT ?id ?name ?description WHERE {
SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
  VALUES ?name {
    "${id}"@en
  }
  ?id rdfs:label ?name;
    schema:description ?description.
  FILTER((LANG(?name)) = "en")
  FILTER((LANG(?description)) = "en")
}
`;

  const queryForAuthorInfo = `
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
SELECT DISTINCT ?related ?relatedLabel WHERE {
  VALUES ?target {
    wd:${id}
  }
  { ?target ?prop ?related. }
  UNION
  { ?related ?prop ?target. }
  FILTER(CONTAINS(STR(?related), "/entity/Q"))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY (UCASE(?relatedLabel))`;

  const query = queryForAuthors;

  const queryEngine = new QueryEngine();

  const result = (
    await queryEngine.queryBindings(query, { sources: ["https://query.wikidata.org/sparql"] })
  ).on("data", (binding) => {
    // console.log(binding.toString()); // Quick way to print bindings for testing
    authorDescriptions.push(binding.get("description").value);
  }).on("end", () => console.log(authorDescriptions));

}

getAuthors("Douglas Adams");
