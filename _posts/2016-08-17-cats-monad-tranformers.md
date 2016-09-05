---
layout:            post
title:             "Monad Transformers with Cats"
menutitle:         "Monad Transformers with Cats"
category:          Programming
author:            pascr
tags:              optionT option future scala
---

I decided to start this blog in order to share some nice and useful findings about software engineering and more precisely about the Scala language and its ecosystem. 
I recently started looking at the [Cats](http://typelevel.org/cats) library and I will try to share over the next few posts some of the data types it provides.                 

## Work in progress

Soon more details...

<!--- 
##  OptionT

{% highlight scala %}
import cats.data.OptionT
import cats.implicits._

import scala.concurrent.Future
import scala.concurrent.ExecutionContext.Implicits.global

val greetingFO: Future[Option[String]] = Future.successful(Some("Hello"))

val firstnameF: Future[String] = Future.successful("Jane")

val lastnameO: Option[String] = Some("Doe")

val ot: OptionT[Future, String] = for {
  g <- OptionT(greetingFO)
  f <- OptionT.liftF(firstnameF)
  l <- OptionT.fromOption[Future](lastnameO)
} yield s"$g $f $l"

val result: Future[Option[String]] = ot.value
{% endhighlight %}
 --->